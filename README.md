# ShowTime

A scoped-down, BookMyShow-style movie ticket booking platform, built as a
portfolio project to demonstrate production-style concurrency handling in
a real-time seat-booking flow — plus hands-on use of Redux Toolkit,
Material-UI, Redis, Socket.io, and a Turborepo monorepo.

Browse movies and showtimes, watch a live seat map update as other people
select seats, hold and book seats (solo or as a group), check out as a
guest or a logged-in user, and rate movies after watching them. A separate
admin panel manages the catalog (movies, theatres, screens, seat layouts,
shows, pricing) and moderates bookings/ratings.

**The centerpiece of this project is the booking flow's race-condition
handling** — see [Race-condition handling](#race-condition-handling-the-centerpiece)
below, and [INTERVIEW_NOTES.md](./INTERVIEW_NOTES.md) for the deep dive.

---

## Architecture

```
                        ┌─────────────────┐
                        │   apps/web       │  React + Redux Toolkit + MUI
                        │  (customer app)  │  Socket.io-client
                        │  :5173           │
                        └────────┬─────────┘
                                 │  HTTP (cookies) + WebSocket
                        ┌────────▼─────────┐        ┌──────────────────┐
                        │    apps/api      │◄──────►│   apps/admin     │
                        │  Express + TS    │  HTTP  │  (admin panel)   │
                        │  :4000           │        │  :5174           │
                        └───┬─────────┬────┘        └──────────────────┘
                            │         │
                somes writes│         │seat locks, socket adapter, cache
                            ▼         ▼
                    ┌───────────┐ ┌──────────┐
                    │ PostgreSQL│ │  Redis   │
                    │ (source   │ │ (fast    │
                    │  of truth)│ │  path)   │
                    └───────────┘ └──────────┘
```

One Express process, one Postgres database, one Redis instance, three
frontends. No Kubernetes, no microservices, no message queue, no GraphQL —
deliberately kept to a size one engineer can hold in their head and
explain end-to-end.

### Why Socket.io + the Redis adapter specifically

The seat map needs to update live across every browser looking at the same
show, without polling. Socket.io gives us rooms (`show:{showId}`) for
free. The `@socket.io/redis-adapter` is what makes `io.to(room).emit(...)`
correct if this API ever ran as **more than one Node process** (e.g.
behind a load balancer): Socket.io's default in-memory adapter only knows
about sockets connected to *that* process, so a seat held on the instance
serving client A would never reach client B if B's WebSocket happened to
land on a different instance. The adapter republishes room broadcasts
through Redis pub/sub so every instance's sockets receive them. This repo
runs a single API instance locally, so the adapter isn't load-bearing
today — it's there so the real-time layer is horizontally scalable
without a rewrite, and it's an easy, honest thing to point at in an
interview as "here's the one line that makes this scale out."

---

## Monorepo structure

```
apps/
  web/      customer app — React + TS + Vite + MUI + Redux Toolkit + socket.io-client
  admin/    admin panel — separate React + TS + Vite + MUI app, own login/cookie
  api/      Express + TS + Prisma/Postgres + ioredis + Socket.io
packages/
  shared/   TypeScript types, Zod schemas, and constants shared by all three apps
            (seat categories, booking status enums, socket event names, API DTOs)
```

Turborepo + npm workspaces. Each app has its own `package.json` and `.env`
and can run standalone (`npm run dev --workspace=apps/api`) or all
together (`npm run dev` at the root, via `turbo run dev`).

---

## Database schema

```
User ──< Booking >── Show ──< ShowSeatPrice
  │         │           │
  │         │           └── Screen ── SeatLayout ──< Seat
  │         │                  │                       │
  │         └──< BookingSeat >─┘                       │
  │                    └───────────────────────────────┘
  └──< Rating >── Movie ──< Show
```

- **Movie / Theatre / Screen / SeatLayout / Seat** — the read-only catalog
  customers browse; only the admin app can write it.
- **`Seat.row`/`Seat.col` vs `Seat.label`** — deliberately decoupled. `row`
  and `col` are the seat's position in the physical grid (used only for
  rendering); `label` (e.g. `"A12"`) is the human-readable seat number
  shown everywhere else (booking confirmations, receipts). This lets a
  screen's layout have gaps — aisles, missing seats, a narrower back row
  of recliners — without needing a dense rectangular array. The seed data
  (`apps/api/prisma/seed.ts`) generates a layout with a real center-aisle
  gap (column 5 is skipped on every row) while seat labels stay a dense
  `A1..A9` sequence per row, to make the distinction concrete rather than
  theoretical.
- **`ShowSeatPrice`** — price is per-show-per-category, not fixed on
  `Seat`. The same physical seat can cost differently across shows
  (weekday vs weekend, blockbuster vs matinee).
- **`Booking` / `BookingSeat`** — see the next section; this is the whole
  point of the project.
- **`Rating`** — one per `(movieId, userId)`; eligibility (must hold a
  `CONFIRMED` booking for a `Show` of that movie whose `endTime` has
  passed) is enforced server-side in `ratings.routes.ts`, not just hidden
  in the UI.
- **`Movie.averageRating`** is computed **on read** (a Prisma `aggregate`
  query per movie), not stored and recomputed on write. At this project's
  scale that's a trivial query and it's always exactly correct — there's
  no denormalized value that can drift. A production system with heavy
  read traffic would flip this to recompute-and-store on write (or a
  periodic job), trading a small write-time cost for O(1) reads. See the
  comment on `toMovieDTO` in `apps/api/src/services/movieService.ts`.

**ORM choice: Prisma.** A raw-`pg`-and-hand-written-SQL approach was
considered (and would work fine for the transactional logic specifically —
see below), but Prisma's `$transaction` API keeps the one transaction that
actually matters (booking confirmation) just as explicit while keeping the
admin CRUD routes short. The trade-off: Prisma's schema language doesn't
support partial/filtered unique indexes, which shaped how seat-release-on-
cancellation is modeled (see below) — a deliberate, documented design
choice rather than a limitation worked around silently.

---

## Race-condition handling (the centerpiece)

Two independent layers guard against double-booking a seat. They exist
for **different reasons** and understanding why both are needed — not
just what they do — is the point.

### Layer 1: the Redis seat hold (the fast path)

Selecting a seat attempts:

```
SET seat:{showId}:{seatId} {sessionId} NX EX 300
```

`sessionId` is a UUID the frontend generates once per browser tab
(independent of login, so guests can hold seats too) and persists in
`localStorage`. `NX` means "only set if it doesn't already exist" — so
only one session can ever hold a given seat at a time, atomically, as a
single Redis command. `EX 300` gives the hold a 5-minute TTL, so an
abandoned hold (someone closes the tab) cleans itself up with no cron job
or background sweep needed.

If the key already exists, we check whether *we* own it (re-clicking a
seat you already hold just extends the TTL) — otherwise the request is
rejected with a 409 and a clear "someone else is holding this seat"
message, before any database work happens. This is what makes the seat
map feel instant and correct: under normal operation, two users literally
cannot both select the same seat.

A successful hold broadcasts `seat:held` to everyone else viewing that
show (Socket.io room `show:{showId}`), so their seat map greys the seat
out live, with no refresh. Releasing (explicitly, or implicitly via TTL
expiry — the frontend shows a countdown so the user always knows their
window) broadcasts `seat:released`.

**Why Redis and not, say, an in-memory `Map`?** Because `SET NX EX` gives
us atomic acquire-with-expiry as a single operation for free, and because
the Socket.io Redis adapter (see above) means this same mechanism keeps
working correctly if the API ever scales to more than one process — an
in-memory map would silently stop being a real lock the moment there's a
second Node instance.

### Layer 2: the Postgres unique constraint (the actual guarantee)

Redis holds are **advisory and best-effort**. In every one of these cases,
Redis alone could let two "confirm" requests both believe they're clear to
book the same seat:

- Redis restarts (the lock is lost; the booking data in Postgres is not).
- A hold's 5-minute TTL expires because a slow guest checkout took 6
  minutes — the confirm step must detect this, not silently proceed (see
  below).
- In a scaled-out deployment, a brief network partition lets two
  instances momentarily disagree about lock state.

`BookingSeat` has `@@unique([showId, seatId])`. A row in this table means,
unconditionally, "this seat, on this show, is booked" — full stop, no
status column to check. `confirmBooking()`
(`apps/api/src/services/bookingService.ts`) does the whole booking as ONE
Postgres transaction:

1. Re-validate that every seat in the cart is **still** held by this
   session's Redis lock (`checkHoldsOwnedBy`). If not — a hold expired
   mid-checkout, or another tab released it — this fails fast with a 409
   *before touching Postgres at all*, and reports exactly which seat IDs
   are the problem.
2. Payment is verified — real (TEST MODE) Stripe if `STRIPE_SECRET_KEY`
   is configured, otherwise the original mock (see "Payment: real Stripe
   test mode, with a mocked fallback" below for the full design). Either
   way, a failure here throws *before* the transaction starts — no trace
   is left in the database, and the seat holds are **not** released, so
   the user can immediately retry payment on the same held seats, exactly
   like a real gateway decline.
3. Inside `prisma.$transaction(...)`: insert one `Booking` row, then
   `bookingSeat.createMany(...)` for every seat in the cart. `createMany`
   fails as a **single statement** if *any* row violates the unique
   constraint — Postgres will not insert 3 of 4 seats and silently skip
   the 4th. This all-or-nothing behavior is exactly what makes **group
   bookings** atomic: a 4-seat group booking either reserves all 4 seats
   or none of them; there is no partial state, ever. A booking is capped
   at `MAX_SEATS_PER_BOOKING` (10, `packages/shared/src/constants.ts`) —
   enforced by `confirmBookingSchema`'s `.max()` (the actual guarantee)
   and mirrored client-side in `SeatMapGrid.tsx` (stops a click at the
   11th seat with a clear message, rather than only failing at checkout).
4. If the transaction fails with Postgres error `P2002` (unique
   violation), the whole thing rolls back automatically, and the code
   queries which seat IDs are already taken so the 409 response can name
   them specifically ("one or more selected seats were just booked by
   someone else").
5. Only after the transaction **commits** do we touch Redis (release the
   holds) and Socket.io (broadcast `seat:booked` and `booking:confirmed`).
   The database is updated first, always — the real-time layer only ever
   announces something that has already durably happened.

**Why not just trust Redis?** Because the unique constraint is enforced
by Postgres's storage layer itself, atomically, regardless of what either
concurrent transaction's application code believed a moment earlier — it
doesn't matter whether Redis was down, slow, or simply never asked. It is
the one thing in this whole system that is *unconditionally* true.

**What happens if two users click "confirm" on overlapping seats at
nearly the same instant?** Under normal operation this can't actually
happen for the *same* seat — Redis's `NX` guarantees only one session ever
holds a given seat, so the second person's *hold* attempt (not their
confirm) is rejected up front with a friendly message, long before either
reaches "confirm". The scenario the unique constraint exists for is
exactly the case where Redis *can't* prevent it (down, restarted, or a
race with a TTL) — see `apps/api/scripts/race-test.ts`, a standalone
script that deliberately bypasses the Redis check and fires two
concurrent transactions at the identical `(showId, seatId)` directly, to
prove the database constraint alone is sufficient. Run it:

```bash
cd apps/api
npx tsx scripts/race-test.ts redis   # proves the Redis NX-lock layer: one acquires, one is rejected
npx tsx scripts/race-test.ts db      # proves the Postgres unique-constraint layer, Redis bypassed entirely
```

**What happens if a hold expires mid-checkout?** `checkHoldsOwnedBy` runs
first, before the transaction — a session whose hold TTL ran out gets a
409 ("your hold on one or more seats has expired, please reselect") and
nothing is written to the database. You can reproduce this manually:

```bash
# 1. hold a seat normally via POST /api/seats/hold
# 2. delete its Redis key directly, simulating expiry:
redis-cli del "seat:<showId>:<seatId>"
# 3. POST /api/bookings/confirm with that seat — 409, no DB row created
```

### Why cancellation doesn't need a partial/filtered unique index

`Booking.status` can become `CANCELLED` (a user cancelling their own
confirmed booking). A seat that was booked and then cancelled must become
bookable again. The obvious-looking design — add a `status` column to
`BookingSeat` and a unique index scoped to `WHERE status = 'CONFIRMED'` —
isn't expressible in Prisma's schema language (no partial/filtered
indexes), and would require hand-editing generated SQL migrations to
maintain.

Instead: **cancelling a booking deletes its `BookingSeat` rows** (inside
the same transaction that flips `Booking.status` to `CANCELLED`) — that
deletion *is* the seat-release mechanism. The plain `@@unique([showId,
seatId])` constraint is then sufficient on its own: a row's mere existence
means "booked", so removing the row means "not booked", with no status
value to reason about. Booking **history** (what was booked, at what
price) is preserved separately via an immutable `seatsSnapshot` JSON
column on `Booking`, written once at booking time and never touched by
cancellation — so a cancelled booking still shows its original seats on a
receipt/history view, even though the live `BookingSeat` rows are gone.

---

## Guest checkout

A `Booking` belongs to **either** a `userId` **or** a `guestName`/
`guestEmail`, never both, never neither — enforced in
`confirmBooking()` (not just at the schema level, since Prisma can't
express an XOR constraint declaratively). Guests provide name + email
(+ optional phone) at the confirm step instead of logging in, and receive
a human-readable reference code (e.g. `SHOW-8F3K2Q`, generated in
`utils/bookingRef.ts`) which they can later use with their email on the
"Find my booking" page (`POST /api/bookings/find`) — deliberately returns
the same 404 whether the reference doesn't exist or the email doesn't
match, so the endpoint can't be used to enumerate valid reference codes or
confirm which email a booking belongs to. Guests can never rate movies —
the ratings endpoint requires the customer auth cookie, so there is no
code path from "guest" to "rating" at all, not just a hidden button.

---

## API reference

Base URL: `http://localhost:4000`. All state-changing requests from a
browser need `credentials: "include"` (cookies) and, for seat-hold/
booking endpoints, an `X-Session-Id` header (a client-generated UUID,
independent of login — see Layer 1 above).

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | — | `{name,email,password,confirmPassword,referralCode?}` → sets `st_customer_token` cookie; an optional referrer's code, silently ignored if invalid, never blocks registration |
| POST | `/api/auth/login` | — | `{email,password}` |
| POST | `/api/auth/logout` | — | clears cookie |
| GET | `/api/auth/me` | customer cookie | current user (includes `emailVerified`, `walletBalance`, `referralCode`) |
| POST | `/api/auth/verify-email` | — | `{email,otp}` → 204, or 400 if wrong/expired |
| POST | `/api/auth/resend-otp` | — | `{email}` → always 204 (doesn't reveal account state) |
| POST | `/api/auth/forgot-password` | — | `{email}` → always 204 (doesn't reveal account state) |
| POST | `/api/auth/reset-password` | — | `{email,otp,newPassword,confirmNewPassword}` → `{user}` + sets session cookie, or 400 if wrong/expired |
| GET | `/api/movies?search=&genre=&city=&bookable=` | — | catalog list; `bookable=true` narrows to movies with an upcoming show — the "Now Showing" page uses this, plain `/api/movies` (no flag) returns the WHOLE catalog including unscheduled titles |
| GET | `/api/movies/genres` | — | distinct genre list, for the filter dropdown |
| GET | `/api/movies/discover?query=` | — (rate-limited) | live OMDb search — browse ANY real movie, not just ShowTime's own catalog — see "Search Movies vs Now Showing" below |
| GET | `/api/movies/discover/trending` | — (rate-limited) | a fixed slice of real, curated titles resolved through OMDb (cached 6h) — default view before a search is typed |
| GET | `/api/movies/discover/:externalId` | — (rate-limited) | OMDb details (incl. director/cast/awards/language/country/rated) + IMDb rating + whether this title is bookable in ShowTime |
| GET | `/api/movies/:id` | — | movie detail incl. average rating |
| GET | `/api/movies/:id/shows?city=` | — | upcoming shows for a movie, optionally narrowed to one city (carries a previously-selected city into the movie detail page) |
| GET | `/api/movies/:id/ratings?page=` | — (optionally authenticated) | paginated reviews + star-count distribution; `myVote` on each rating only when logged in |
| GET | `/api/movies/:id/similar` | — | same-genre bookable movies, for "you might also like" |
| GET | `/api/movies/recommended` | — (optionally authenticated) | personalized picks from the caller's own booking history; `[]` for guests |
| GET | `/api/events?search=&category=&city=&bookable=` | — | event catalog — same semantics as `/api/movies` above, `category` instead of `genre` |
| GET | `/api/events/:id` | — | event detail |
| GET | `/api/events/:id/sessions?city=&format=&language=` | — | upcoming sessions for an event — same `ShowDTO` shape as `/api/movies/:id/shows`, booked through the identical seat-map/checkout flow |
| GET | `/api/theatres` | — | theatre list |
| GET | `/api/theatres/cities` | — | distinct **serviceable** city list (cities ShowTime actually has theatres in) |
| GET | `/api/locations/india-cities` | — (rate-limited) | ~4,267 real Indian cities/towns, for the city picker's search box — see below |
| GET | `/api/locations/reverse-geocode?lat=&lon=` | — (rate-limited) | resolves browser geolocation coordinates to a city name |
| GET | `/api/locations/nearest-cities?lat=&lon=` | — (rate-limited) | nearest serviceable city/cities to a coordinate, by real distance to actual theatres — see below |
| GET | `/api/shows/:showId/seatmap` | X-Session-Id | live seat statuses + per-category prices |
| POST | `/api/seats/hold` | X-Session-Id | `{showId,seatId}` → 409 if taken |
| POST | `/api/seats/release` | X-Session-Id | `{showId,seatId}` |
| POST | `/api/bookings/preview-coupon` | X-Session-Id | `{code,showId,seatIds}` → discount preview, re-verified independently at confirm time |
| POST | `/api/bookings/create-payment-intent` | X-Session-Id | `{showId,seatIds,couponCode?,foodItems?,useWallet?,roundUpDonation?}` → real Stripe PaymentIntent for `finalAmount` (via the single shared `computeBookingCharges`), or `{stripeConfigured:false}` if unconfigured **or** wallet covers the order in full |
| POST | `/api/bookings/confirm` | X-Session-Id (+ optional cookie) | the transaction — see above; same optional `couponCode`/`foodItems`/`useWallet`/`roundUpDonation` |
| GET | `/api/bookings/mine` | customer cookie | booking history (incl. food items, coupon, wallet-used) |
| POST | `/api/bookings/find` | — | `{reference,email}` guest lookup |
| POST | `/api/bookings/:id/cancel` | customer cookie, owner only | frees the seats + refunds (Stripe refund and/or wallet credit — see above) |
| GET | `/api/food-items` | — | active F&B menu for checkout |
| GET | `/api/wallet/transactions` | customer cookie | the caller's own wallet ledger |
| POST | `/api/ratings` | customer cookie | `{movieId,stars,comment?,isSpoiler?}`, eligibility enforced server-side |
| POST | `/api/ratings/:id/vote` | customer cookie | `{helpful:boolean}` → upserts the caller's vote, can't vote on your own review |
| GET | `/api/waitlist` / POST `/api/waitlist` | — | `{movieId,email}` "notify me" signup for an unscheduled movie |
| GET | `/api/offers` | — | browsable "deals wall" over the active/unexpired Coupon table |
| GET | `/api/movies/:id/review-summary` | — | AI-generated 3-4 bullet summary of recent reviews (Groq, Redis-cached), `null` if fewer than 3 reviews or `GROQ_API_KEY` unset |
| POST | `/api/ai/search` | — (rate-limited) | `{query}` free-text mood/vibe search over the bookable catalog — see "GenAI features" below |
| POST | `/api/ai/chat` | — (optionally authenticated, rate-limited) | `{messages}` conversational booking assistant — read-only tools only, see "GenAI features" below |
| POST | `/api/gift-cards/create-payment-intent` | — | `{value}` (₹100-10,000) → PaymentIntent, or the mocked fallback |
| POST | `/api/gift-cards/purchase` | — (optionally authenticated) | `{value,recipientEmail,purchasedByEmail?,message?,paymentIntentId?}` → `{code,value}`; emails the code to the recipient |
| POST | `/api/gift-cards/redeem` | customer cookie | `{code}` → credits the full value into the caller's wallet, one-shot (can't be redeemed twice) |
| GET | `/api/donations/total` | — | aggregate "₹X raised" across all confirmed bookings' round-up donations (demo feature, see below) |
| POST/GET/PUT/DELETE | `/api/admin/*` | admin cookie (`st_admin_token`), role ADMIN | full catalog + booking/rating moderation CRUD — see `apps/api/src/routes/admin/` |
| GET/POST/PUT/DELETE | `/api/admin/coupons` | admin cookie | coupon CRUD |
| GET/POST/PUT/DELETE | `/api/admin/food-items` | admin cookie | F&B menu CRUD |
| GET/POST/PUT/DELETE | `/api/admin/events` | admin cookie | event catalog CRUD |
| GET/POST/DELETE | `/api/admin/event-sessions` | admin cookie | schedule/list/cancel event sessions onto a screen — mirrors `/api/admin/shows` |
| GET | `/api/admin/gift-cards` | admin cookie | read-only gift-card activity (support visibility — not admin-created) |
| GET | `/api/admin/analytics/overview?days=` | admin cookie | revenue/bookings/top-movies/top-events/city breakdown over a rolling window |
| GET | `/api/admin/external-movies/search?query=` | admin cookie | proxies OMDb search — see below |
| POST | `/api/admin/external-movies/import` | admin cookie | `{externalId}` → creates/updates a local `Movie` from OMDb data |
| POST | `/api/admin/external-movies/bulk-import` | admin cookie | resolves ~65 curated real titles through OMDb in one request — see below |
| GET | `/api/admin/theatre-discovery/search?city=` | admin cookie | real cinema locations from OpenStreetMap — see below |
| POST | `/api/admin/theatre-discovery/import` | admin cookie | `{osmId,name,address,city}` → creates a local `Theatre` (+2 screens) from a real OSM location |
| POST | `/api/admin/shows/auto-schedule` | admin cookie | `{movieIds}` → fast bulk scheduling across screens with no upcoming show — see below |

Socket.io events (room `show:{showId}`, joined via client emit
`"show:join"` with the showId): `seat:held`, `seat:released`,
`seat:booked`, `booking:confirmed`.

All error bodies: `{error: string, message: string, details?}`. Status
codes: 400 validation, 401 not authenticated, 403 not authorized /
ineligible, 404 not found, **409 the seat/hold conflict cases above**, 402
mocked payment decline, 500 unexpected.

---

## Real movie data, location filtering, e-tickets, and email

Additions layered onto the original design after review feedback that
(correctly) pointed out the catalog was all placeholder data, there was
no way to browse "what's near me," bookings had no physical artifact, and
signup had no real email verification.

### Real movie data via OMDb (admin-side import, not a live dependency)

Movies are still **admin-authored, local `Movie` rows** — that doesn't
change, and it matters: bookings, ratings, and pricing all have foreign
keys into `Movie.id`, so the catalog has to be something *we* own, not a
live pass-through to a third party (an external catalog can rename,
rate-limit, or go unreachable — none of that should ever be able to break
an existing booking's history).

What changes is *how an admin populates a movie*: alongside the existing
manual create/edit form, `apps/admin` has an "Import Movie" flow
(`apps/api/src/services/externalMovieService.ts`,
`apps/api/src/routes/admin/externalMovies.routes.ts`, mounted at
`/api/admin/external-movies`). An admin searches by title, picks a real
result, and the API fetches that title's real overview/poster/runtime/
genre and **upserts** a local `Movie` row keyed on a `Movie.externalId`
column (nullable + unique — null for hand-entered movies, set for
imported ones, unique so re-importing the same title updates rather than
duplicates it). From that point on, it's an ordinary local `Movie` row:
editable, bookable, ratable, exactly like a hand-typed one.

**This project switched providers once already** (TMDB → OMDb, when TMDB
access turned out unreliable from this deployment's network) with zero
customer-facing impact, specifically *because* the module/route/column
naming was kept provider-agnostic (`externalMovieService.ts`,
`/api/admin/external-movies`, `Movie.externalId` — never `tmdbService`/
`Movie.tmdbId`). That's a deliberate lesson worth stating plainly: name
an integration point after the *role* it plays, not the vendor
implementing it today, and a provider swap stays a two-file change
instead of a search-and-replace across the app.

Requires a free OMDb API key (`OMDB_API_KEY` in `apps/api/.env`, from
omdbapi.com/apikey.aspx — free, emailed instantly). Without one, the
import feature returns a clear 500 rather than the app failing to boot;
nothing else in the app depends on it. OMDb quirks worth knowing if you
extend this: it always responds HTTP 200, even for errors — failures
only show up in the JSON body's `Response`/`Error` fields, which
`externalMovieService.ts` checks explicitly rather than trusting
`res.ok`; and its search endpoint returns no synopsis (only the
per-title details call does), so search results show a poster/title/year
only until something is actually imported.

**Bulk-populating a real catalog.** One-at-a-time search-and-import is
fine for curating a specific catalog, but doesn't get you from "4 movies"
to "a real-feeling library" quickly. The admin Movies page also has a
**"Populate Popular Movies"** button (`POST
/api/admin/external-movies/bulk-import`) that resolves a curated list of
~65 well-known real titles (`apps/api/src/data/curatedMovieTitles.ts`,
mixing internationally known films and Bollywood titles) through OMDb —
one request per title, 5 at a time, in a few seconds. Every imported
movie is still 100% real OMDb data (poster, runtime, genre, synopsis);
only the *selection* of which titles to fetch is a static list, not the
data itself. This exists specifically because **OMDb has no "trending" /
"now playing" / "discover" endpoint** — unlike TMDB, it only supports
exact lookups (by id or by title), so there is no free way to ask it
"what's popular right now." A curated title list resolved through
per-title lookups is the practical middle ground available without a
paid discovery API.

**Important: restart the API after setting/changing any API key in
`.env`** (`OMDB_API_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, etc). `dotenv` only reads
`apps/api/.env` once, at process startup — editing the file while `npm
run dev`/`tsx watch` is already running does *not* take effect, since
`.env` isn't part of the module graph `tsx watch` tracks for changes.
The API logs each integration's configured/not-configured status at
startup specifically so this is immediately checkable — if you just set
a key and still see "not configured" in that startup line, the process
needs a restart, not a different key.

### Search Movies vs Now Showing — two different questions, two different pages

An early version of this app mixed "browse the catalog" and "book a
ticket" into one movie list — which meant clicking some movies (bulk-
imported real titles with no scheduled shows yet) led nowhere, with no
explanation why. Real platforms never do this: BookMyShow only ever
*lists* what you can actually book. The fix is two genuinely separate
concepts, not a flag on one page:

- **Now Showing** (the home page) answers "what can I book right now" —
  it calls `GET /api/movies?bookable=true`, which only returns movies
  with at least one **upcoming** `Show` row. Nothing on this page is a
  dead end.
- **Search Movies** answers "what does a real movie database know about
  any title" — it calls the public `GET /api/movies/discover` /
  `/discover/:externalId` endpoints, which proxy OMDb live and are
  completely independent of ShowTime's own catalog. A result here shows
  real poster/synopsis/runtime/genre and OMDb's own `imdbRating`
  (explicitly labeled as IMDb's rating, never conflated with this app's
  own user-review system — those two numbers can legitimately differ and
  mean different things). If that title *also* happens to be in
  ShowTime's catalog with an upcoming show, the detail view offers a real
  "Book Now" link into the normal booking flow; if not, it says so
  plainly ("not currently available for booking") rather than pretending
  a purchase path exists.

Mixing these into one endpoint/page would make it easy to accidentally
present a browsable-but-unbookable result as if it were a normal catalog
entry — exactly the bug this split exists to prevent.

Search Movies also shows a **"Trending Now"** section by default, before
any query is typed, via `GET /api/movies/discover/trending` — a fixed
slice of ~12 well-known real titles resolved through OMDb (same curated
list the admin bulk-import uses) and cached server-side for 6 hours.
This exists purely so the page never opens to an empty search box — the
titles themselves are real OMDb data either way, only the *selection* of
which dozen to show by default is fixed rather than live (OMDb has no
"trending" concept of its own to ask). A discover result's detail view
also now surfaces more of what OMDb actually returns — director, cast,
awards, language, country, and content rating — not just poster/genre/
runtime, so browsing a title feels closer to a real movie database entry.

### Carrying a selected city into a movie's showtimes

`GET /api/movies/:id/shows` accepts an optional `?city=`, narrowing a
movie's shows to one city's theatres — this is what lets a city chosen on
the home page carry through into a movie's detail page by default,
instead of showing every theatre in every city that movie happens to
play in (a real bug in an earlier pass: the city filter only ever
affected the home page's movie list, never what you saw after clicking
into a specific movie). The selected city lives in its own small,
`localStorage`-persisted Redux slice (`src/store/slices/locationSlice.ts`
in `apps/web`) rather than page-local state, specifically so it survives
navigating between pages (and a page reload) — "the city I picked" is a
piece of session-wide context, not something scoped to whichever page
happened to render the picker. The movie detail page always shows an
obvious, one-click way to switch to a different city or clear the filter
entirely — a persisted default should never feel like a trap with no way
out.

### Real, dynamic location data — city search and browser geolocation

Two free, keyless public APIs back the city picker (`apps/api/src/services/locationService.ts`):

- **`GET /api/locations/india-cities`** proxies a real list of ~4,267
  Indian cities and towns (cached 24h in Redis), used for the city
  picker's search-as-you-type `Autocomplete`. This is genuinely live,
  real third-party data — unlike theatre listings (see below), a plain
  list of city *names* is exactly the kind of thing a free geo API can
  and does provide.
- **`GET /api/locations/reverse-geocode?lat=&lon=`** proxies OpenStreetMap's
  free reverse-geocoding service, turning `navigator.geolocation`
  coordinates into a city name server-side (kept server-side specifically
  because Nominatim's usage policy requires a real `User-Agent` header
  identifying the calling app — centralizing that in one place is
  simpler and avoids a CORS dance from the browser).

**The city Autocomplete's list and the "what can I actually book" list
are deliberately two different data sources.** You can pick literally
any real Indian city (e.g. "Siliguri," a real city ShowTime has no
theatres in) from the big list above. Doing so is allowed and expected;
`GET /api/movies?bookable=true&city=Siliguri` will legitimately return
zero results, and the UI shows a plain "ShowTime doesn't have theatres
in Siliguri yet" message with the actual serviceable cities
(`GET /api/theatres/cities` — the curated ~11-city list) offered as
quick picks.

**"Use my location" is different — it resolves to a real nearest
theatre, not just a name match.** Reverse-geocoding a coordinate
correctly returns whatever real place you're standing in (a small town,
a district name), which will almost never exactly string-match one of
the ~11 cities ShowTime has theatres in. So `Theatre.lat`/`Theatre.lon`
(real coordinates — set on OSM import, or hand-assigned to a real
city-center for seeded theatres) back a second lookup,
**`GET /api/locations/nearest-cities?lat=&lon=`**
(`locationService.ts`'s `findNearestServiceableCities`), which computes
real great-circle (haversine) distance from that coordinate to every
theatre with known coordinates and returns the nearest serviceable
city. Concretely: geolocating from Bethuadahari (a real small town in
West Bengal) reverse-geocodes to "Nadia" (its district — Nominatim has
no finer-grained `city` tag there), which isn't serviceable, so the
city filter falls back to the nearest one that is — **Krishnanagar,
~11km away** — with a toast saying exactly that, rather than either
silently picking an unrelated city or dead-ending on "not served." A
typed/Autocomplete-picked unserviceable city still gets the plain quick-
picks fallback above (it has no coordinate to compute a real distance
from — you typed a name, not a GPS point) — only the geolocation path
has a real point to measure from.

### Real theatre locations via OpenStreetMap, and a fast bulk show scheduler

A theatre's **name and location** turned out to have a genuinely free,
open source after all: **OpenStreetMap** (ODbL-licensed, free, keyless)
maps real-world points of interest, including real cinemas — actual
chains like PVR, INOX, and Cinépolis, plus independent single-screen
theatres — tagged `amenity=cinema`. The admin Theatres page has an
**"Import Real Theatre"** flow (`apps/api/src/services/theatreDiscoveryService.ts`,
`/api/admin/theatre-discovery/*`) that geocodes a city (via Nominatim, to
get a bounding box — more robust than matching Overpass's "area name"
exactly, which is fragile across naming variants like "Bangalore" vs
OSM's "Bengaluru"), then queries the Overpass API for every cinema node
in that box. Importing one creates a real local `Theatre` row — genuine
name, genuine address — with two screens auto-generated with a default
seat layout (an admin can hand-edit that layout afterward via the
existing seat layout editor; OSM has no opinion on a cinema's actual
seating chart, since no free source publishes that either).

**This narrows, but does not eliminate, the earlier limitation.** A
theatre's *existence and location* can now be real. Its *screens, seat
layout, and — critically — its schedule* still cannot come from
anywhere free: no public API anywhere publishes which movie is playing
at which real theatre, when, at what price — that actually is the
proprietary operational data platforms like BookMyShow keep to
themselves, and remains true regardless of how good the location data
gets. So `Show` rows stay admin-curated, either by hand or via a new
**"Auto-schedule Shows"** bulk admin action (`POST
/api/admin/shows/auto-schedule`) that distributes a set of movies an
admin has already picked across every screen currently lacking an
upcoming show, at staggered times over the next few days. This is
explicitly a fast data-entry convenience, not a live feed of any
kind — worth being precise about the difference: "real theatre, admin-
scheduled showtimes" is an honest, useful state to be in; claiming the
schedule itself is "dynamic" would not be.

### QR code e-tickets — in the app, and emailed

A booking's confirmation screen and "My Bookings" list render a QR code
(via `qrcode.react`, generated client-side) encoding a compact plain-text
ticket: reference, movie, seats, and showtime. My Bookings shows this
ticket **inline by default** for every confirmed booking — the reference
code was never meant to be the primary artifact a user sees; the ticket
is. A production version scanned by real theatre staff would likely
encode a **verification URL** (`/verify/:reference`) instead of the raw
details, so staff-side scanning could check the reference against the
database and mark it checked-in — called out here as a natural next
step, not built, since it needs an admin-side "scan to verify" screen
this project doesn't otherwise need.

The same ticket is also **emailed** — see "Real email delivery" below —
using a server-generated PNG of the identical QR payload
(`services/emailService.ts`, via the `qrcode` npm package), so an emailed
ticket and the in-app one scan to the same thing.

### Real email delivery (Resend) — OTP verification, password reset, ticket emails

Three places in this app now send real email, via [Resend](https://resend.com):

1. **OTP email verification at registration.** `POST /api/auth/register`
   still logs the user in immediately (verification does **not** gate
   login, booking, or rating in this implementation — see the comment on
   `User.emailVerified` in `schema.prisma` for why that's a deliberate
   scope boundary, not an oversight) but also generates a 6-digit code,
   stores it in Redis (`otp:verify-email:{userId}`, 10-minute TTL — the
   same `SET ... EX` pattern as seat holds, reused here because "a
   short-lived, self-expiring value" is exactly what it is again), and
   emails it. `POST /api/auth/verify-email` checks the code and flips
   `User.emailVerified`; `POST /api/auth/resend-otp` re-issues one.
2. **Forgot-password OTP.** `POST /api/auth/forgot-password` (`{email}`)
   issues a 6-digit code the same way, under a separate Redis namespace
   (`otp:reset-password:{userId}` — `otpService.ts` takes a `purpose` so
   an in-flight email-verification code and an in-flight password-reset
   code for the same user can never collide with or invalidate each
   other) and emails it. `POST /api/auth/reset-password`
   (`{email,otp,newPassword,confirmNewPassword}`) verifies the code and
   the new password together as one action — there's no separate
   "code verified, now pick a password" step, so a checked-but-unused
   code can never sit around as a standing credential — then logs the
   user in with their new password, same as registration does. Both
   `forgot-password` and `resend-otp` always respond `204` whether or not
   an account exists for that email, for the same reason
   `POST /api/bookings/find` always returns the same 404 either way — no
   endpoint in this app should be usable to enumerate which emails have
   accounts.
3. **Booking ticket emails**, sent to whichever email a booking actually
   belongs to (the guest's `guestEmail`, or a logged-in user's account
   email) immediately after a booking confirms.

Both are **fire-and-forget**: registration succeeds and a booking's HTTP
response returns regardless of whether the email send succeeds. This
matters most for bookings specifically — by the time an email is even
attempted, the booking has already durably committed inside the Postgres
transaction (see the race-condition section above); a slow or failing
email provider must never be able to delay or appear to fail a booking
that has, in fact, already succeeded. `bookingService.ts` looks up the
recipient and calls `sendBookingTicketEmail` without `await`ing it into
the response path, and `emailService.ts` internally catches and logs
(never throws) any send failure.

Without `RESEND_API_KEY` configured, every email is instead **logged in
full to the API's console** — same graceful-degradation pattern as OMDb:
a missing third-party credential shrinks a feature's real-world reach, it
never breaks the feature's caller or the app's boot. This also makes the
feature fully demoable offline: register a test account and the OTP is
sitting right there in the terminal.

One real constraint worth knowing: Resend's sandbox (no verified sending
domain) can only deliver to the email address that owns the Resend
account — not to arbitrary guest emails. Verifying a domain removes this
limit; until then, treat the console log as the reliable way to see what
would have been sent to anyone else.

### Payment: real Stripe test mode, with a mocked fallback

Payment now goes through real **Stripe, in test mode only** (never live
keys) — `apps/api/src/services/paymentService.ts` — with the original
mocked behavior kept as an automatic fallback when `STRIPE_SECRET_KEY`
isn't configured, the same graceful-degradation posture as every other
optional integration in this app.

**Flow:**
1. `POST /api/bookings/create-payment-intent` (`{showId, seatIds}`, needs
   the same `X-Session-Id` + valid Redis hold as everywhere else) creates
   a real Stripe `PaymentIntent` for the cart's actual total (computed
   server-side, never trusted from the client) and returns a
   `client_secret`.
2. The frontend mounts Stripe's `PaymentElement` with that secret and
   calls `stripe.confirmPayment(...)`. Test-mode card payments without 3D
   Secure resolve **synchronously** in the browser — no webhook
   infrastructure is needed for this app to know the outcome, which is
   what lets checkout stay the single synchronous request/response flow
   the rest of this design already assumes.
3. `POST /api/bookings/confirm` now takes a `paymentIntentId` instead of
   the old `simulatePaymentFailure` flag (which still works, but only
   when Stripe isn't configured). The server **re-fetches the
   PaymentIntent from Stripe itself** — never trusts the client's word
   that payment succeeded — and checks three things before proceeding:
   status is `succeeded`, the amount matches this exact cart's total, and
   the PaymentIntent's metadata (`showId` + a sorted seat-id key) matches
   this exact attempt, so a PaymentIntent created for one cart can't be
   replayed against a different one. `Booking.paymentIntentId` is also
   `@unique`, so the same successful payment can never be attached to two
   bookings.
4. This verification happens **before** the atomic seat-booking
   transaction — exactly where the old mock check lived. The two-layer
   Redis/Postgres concurrency design (the actual centerpiece of this
   project) is completely unaffected by which payment path is active;
   payment is a gate in front of the transaction, never inside it.

**Demo test cards** (Stripe test mode, no real charge ever occurs):
`4242 4242 4242 4242` (any future expiry, any CVC, any ZIP) always
succeeds; `4000 0000 0000 0002` always declines, for exercising the
failure path with a real Stripe response instead of a boolean flag.

---

## Coupons, F&B, wallet, referrals, review voting, and admin analytics

A further round of BookMyShow-parity features, layered on top of the
booking/payment core above without changing it — every one of these
plugs in as an additional line item or a gate *before* the atomic
seat-booking transaction, never inside it.

### Pricing pipeline: one function, two callers, no drift

The checkout total now has four components — seats, coupon discount,
food, wallet — computed by pricing functions
(`computeSeatsPricing`, `applyCoupon`, `computeFoodCart`) that live in
`apps/api/src/services/`. Both `POST /api/bookings/create-payment-intent`
(which decides how much Stripe should charge) and
`POST /api/bookings/confirm` (which re-verifies that charge before
booking anything) call the exact same functions in the exact same
order:

```
totalAmount (seats)  →  − discountAmount (coupon)  →  + foodTotal  →  − walletAmountUsed  =  finalAmount
```

This is the same "one function, two callers" discipline the original
coupon/Stripe design already used — the alternative (each endpoint
computing the total its own way) is exactly how you end up with a
PaymentIntent for one amount and a confirm-time recomputation that
disagrees with it. `finalAmount === 0` (wallet covers the whole order)
is a real, tested case: Stripe can't create a ₹0 PaymentIntent, so
`create-payment-intent` returns `{stripeConfigured: false}` in that
case even when Stripe *is* configured, and the frontend's existing
"skip Stripe Elements, call confirm directly" path — already built for
the "Stripe not configured" case — handles it for free.

### Coupons

`Coupon` (code, PERCENT/FLAT, value, optional max uses/expiry) is
plain admin-managed CRUD (`/api/admin/coupons`). `POST
/api/bookings/preview-coupon` lets the checkout UI show "₹50 off"
before payment; the discount is independently recomputed (never
trusted from that preview) inside `confirmBooking`, and usage count is
only incremented after a booking actually succeeds, inside the same
transaction as the booking write.

### Food & Beverage add-ons

`FoodItem` (name, price, SNACK/DRINK/COMBO, active flag) is admin CRUD
(`/api/admin/food-items`) with a public read-only menu at `GET
/api/food-items`. `computeFoodCart` — the same "never trust
client-supplied prices" rule as seats — looks up each item's real,
current price and name server-side from `{foodItemId, quantity}`
pairs and rejects deactivated items. A booking's food order is stored
as `BookingFoodItem` rows, which snapshot name/price at order time
(same reasoning as `seatsSnapshot`) so a later menu price change never
rewrites a past receipt.

### Wallet

`User.walletBalance` is a denormalized running balance;
`WalletTransaction` is the immutable ledger it's derived from. Every
balance change goes through one function, `adjustWallet` (in
`walletService.ts`), which updates both in the same Prisma transaction
as whatever caused the change — a booking spend, a cancellation
refund, or a referral bonus — so the cached balance can never drift
from what the ledger says happened. `useWallet: true` at checkout
applies **as much of the balance as covers the order**, never a
client-dictated amount; the server decides the actual number.

**Cancellation refunds** (`cancelBooking`) split the refund by how it
was paid: the wallet-spent portion always goes back to the wallet; the
cash portion goes to a real Stripe refund
(`stripe.refunds.create`) when a `paymentIntentId` exists, falling
back to a wallet credit if the Stripe call fails or if the original
payment was the mocked fallback (no real charge existed to refund from
a card in that case). The Stripe call happens *before* the DB
transaction opens, not inside it — a transaction shouldn't sit open
across a network call to a third party.

### Referral program

Every user gets a `referralCode` (8 random characters, generated at
registration) and can optionally supply someone else's code as
`referralCode` on `POST /api/auth/register`. The bonus (₹100 to both
sides) is paid on the **referred user's first CONFIRMED booking**, not
at signup — `awardReferralBonusIfEligible` checks
`User.referralBonusAwarded` to guarantee it only ever fires once,
inside the same transaction as that first booking.

### Review helpfulness voting + spoiler tags

`Rating.isSpoiler` (set by the reviewer) hides the review text behind
a "contains spoilers" reveal on the frontend. `RatingVote` (upsert per
`{ratingId, userId}`, `POST /api/ratings/:id/vote`) lets other users
mark a review helpful/not-helpful; a reviewer can't vote on their own
review. `GET /api/movies/:id/ratings` is now optionally authenticated
(`optionalCustomerAuth`) purely so it can tell the viewer their own
prior vote (`myVote`) apart from "not logged in" (`myVote` omitted
entirely) versus "logged in, hasn't voted" (`myVote: null`).

### Admin analytics dashboard

`GET /api/admin/analytics/overview?days=` computes revenue, booking
counts/status breakdown, seats sold, revenue-by-day, top movies, and
bookings-by-city over a rolling window, by reducing over that window's
`CONFIRMED` bookings in memory (see `analytics.routes.ts`) rather than
a set of separate aggregate queries — at this project's scale that's
simpler and exactly as correct as a real OLAP query would be, and it's
one bounded query rather than several.

---

## BookMyShow-parity round: gift cards, accessibility, offers, loyalty, recommendations, donations

Researched against BookMyShow's actual real-world feature set (gift
cards, accessible seating, an offers wall, membership perks,
personalized picks, and its BookASmile charity round-up) rather than
guessed — then implemented what's realistically buildable in a demo's
complexity budget, and explicitly skipped what isn't (see the end of
this section).

### Gift cards — a purchasable, giftable credit code

Paid for like a booking (a real Stripe test-mode `PaymentIntent`, same
verify-before-booking discipline, or the mocked fallback), then
redeemed by anyone holding the code. Redemption is deliberately
all-or-nothing: `GiftCard.value` is credited straight into the
redeemer's wallet in one shot via the same `adjustWallet` every wallet
change goes through, rather than the model tracking its own partial
remaining balance — the wallet already supports spending a balance
across many future bookings, so a second "partial balance" concept
here would just be the same feature built twice.
`POST /api/gift-cards/purchase` → `POST /api/gift-cards/redeem`.

### Wheelchair-accessible seating

`Seat.wheelchairAccessible` — purely informational (never affects
price or the booking/hold concurrency logic), surfaced as a badge on
the seat map and toggleable per-seat in the admin layout editor. The
default seat-layout generator marks two aisle-adjacent front-row seats
accessible by default, same as every other "reasonable default an
admin can hand-edit" choice this generator makes.

### A shared pricing pipeline (and the bug that made it necessary)

Adding the donation round-up below caused the **exact same class of
bug** that food/wallet support caused earlier in this project:
`create-payment-intent` and `confirmBooking` each independently
re-implemented "seats − discount + food − wallet," and the moment a
new line item (the donation) was added to one and not the other, the
two amounts drifted and every checkout with that feature enabled
failed at the final confirm step. Rather than patch it a second time,
`computeBookingCharges()` in `bookingService.ts` is now the ONE place
this arithmetic exists — both endpoints call it and nothing else. Any
future checkout line item belongs there, not duplicated into both
routes again.

### Charity round-up ("give a little extra")

`roundUpDonation: true` at checkout rounds the pre-wallet total up to
the next ₹10 and adds the difference to what's charged
(`computeDonationAmount` in `donationService.ts`) — a real extra
charge, but an explicitly-labeled **demo feature**: no real charity
integration exists, the checkout UI says so, and since checkout is
Stripe *test mode* only, no real money moves either way regardless.
`GET /api/donations/total` powers a public "₹X raised (demo)" counter.

### Loyalty tiers

Computed live from a user's confirmed-booking count (never stored —
one source of truth, same reasoning as not caching `Movie.averageRating`
beyond what's already derived from `Rating`): BRONZE (0-4 bookings),
SILVER (5-14, 1% cashback), GOLD (15+, 3% cashback). Cashback is a
percentage of what was actually paid out of pocket, credited to the
wallet via `adjustWallet` right after a booking confirms, same
transaction as the referral-bonus check.

### Recommendations ("you might also like" / "recommended for you")

Deliberately simple and explainable — no ML model, no embeddings, just
genre-token overlap between bookable movies (`recommendationService.ts`).
`GET /api/movies/:id/similar` (same-genre movies, for a movie's own
page) and `GET /api/movies/recommended` (personalized, based on the
genres of a logged-in user's own booking history, falling back to
newest releases with no history). Honest about what this is: a real,
useful heuristic, not a dressed-up random shuffle, but not a claim of
a trained model either.

### Offers wall

`GET /api/offers` — a public, browsable view over the existing Coupon
backend (previously code-only: a coupon only helped you if you already
knew it). Filters to active/unexpired/not-fully-used, and deliberately
never exposes `usedCount` (an internal admin detail).

### Group booking bill-split (an honest version)

BookMyShow-style "group booking" implies collecting payment from
multiple people — this app has no peer-to-peer payment rails to do
that for real, and faking a "request sent" flow that doesn't actually
collect money would be actively misleading. So this is what it
actually is: a calculator on the booking success screen ("₹X ÷ N
people = ₹Y each") plus a "copy summary" button for sharing the split
via any channel the booker already uses — never a payment-collection
promise this app can't keep.

### Deliberately skipped from BookMyShow's real feature set (and why)

- **BookMyShow Stream (OTT rental/purchase).** Needs real content
  licensing — not something a demo can responsibly fake.
- **BookMyShow ONLINE (livestreamed events).** Needs real video
  infrastructure and licensing.
- **BUZZ (entertainment news/editorial content).** Needs an editorial
  content pipeline — low value added to a booking-flow demo relative
  to its cost.
- **Bank/wallet-partner cashback offers.** No real payment-partner
  relationships exist to offer against; inventing one would be
  presenting a fake business relationship as real.
- **District (dining + events super-app).** The events half of this is
  now built (see the next section) as its own bounded feature; the
  dining-marketplace half is not.

---

## Events — a second bookable content type

Concerts, comedy nights, plays — booked through the *exact same engine*
as a movie, not a parallel one.

### Why `Show` became generic instead of adding an `EventBooking` table

The tempting-looking design is a full parallel stack: `EventVenue`,
`EventSession`, `EventBooking`, `EventBookingSeat`. It was rejected
specifically because of a bug this project already hit twice earlier in
its own history: two independent implementations of the same checkout
arithmetic (`create-payment-intent` vs `confirmBooking`) drifted apart
the moment a new line item was added to one and not the other (see
`computeBookingCharges`'s comment in `bookingService.ts`). A parallel
`EventBooking` stack would be the exact same mistake at a larger
scale — every future coupon/food/wallet/loyalty/cancellation change
would need to be made twice, correctly, forever, or the two content
types would silently diverge.

Instead, `Show` (`apps/api/prisma/schema.prisma`) became a generic
**"scheduled, bookable session"** — for a `Movie` OR an `Event`, never
both, never neither, enforced by a `kind` discriminant plus a
Postgres `CHECK` constraint (Prisma has no native nullable-XOR
support, so this is one of the few places this project drops to raw
SQL in a migration rather than the Prisma schema alone). Concretely:

```
Show.kind: "MOVIE" | "EVENT"
Show.movieId: String?   (set iff kind = MOVIE)
Show.eventId: String?   (set iff kind = EVENT)
```

Everything downstream of `Show` — `Booking`/`BookingSeat`, the Redis
seat-hold engine, Stripe payment verification, coupons, F&B, wallet
spend, loyalty cashback, referral bonuses, cancellation refunds, the
admin analytics dashboard — is **unmodified, shared code**. The only
places that had to learn about the discriminant at all were the
handful of spots that used to assume `show.movie.title` always
resolves (now `titleOfShow(show)`, one helper, one call site pattern)
and the admin analytics breakdown (which now buckets into `topMovies`
or `topEvents` depending on which id is set).

`Theatre`/`Screen` are reused as-is for event venues too — a "Screen"
is really just "a room with a seat layout," which fits a comedy club's
stage room or a small concert hall equally well as a cinema screen.
Renaming them to "Venue"/"Space" was considered and rejected: it would
be a large, purely cosmetic diff across a lot of already-working code
for zero functional gain.

### What this buys for free

Because a session IS a `Show`, booking a comedy night seat is
byte-for-byte the same request/response flow as booking a movie seat —
`GET /api/shows/:id/seatmap`, `POST /api/seats/hold`,
`POST /api/bookings/create-payment-intent`, `POST /api/bookings/confirm`.
The frontend's entire seat-map/checkout page
(`apps/web/src/pages/SeatMapPage.tsx`) needed **zero changes** to
support events — it already only ever knew about a `showId`, never a
`movieId`. Coupons, food add-ons, wallet spend, the donation round-up,
loyalty cashback, and the bill-split calculator all just work for an
event booking, because they're the same code path, not a re-
implementation that happens to look similar.

### API surface

`GET /api/events` / `GET /api/events/:id` / `GET /api/events/:id/sessions`
mirror `/api/movies`'s shape almost exactly (see the API reference
table below) — `sessions` reuses the exact same `ShowDTO` shape
`/api/movies/:id/shows` returns, just with `eventId` set instead of
`movieId`. Admin CRUD (`/api/admin/events`, `/api/admin/event-sessions`)
mirrors `/api/admin/movies`/`/api/admin/shows` the same way.

### What's deliberately NOT covered

- **General-admission / capacity-based ticketing.** A large concert or
  match with no assigned seats (just "200 GA tickets available") needs
  a genuinely different concurrency primitive than per-seat Redis
  holds — an atomic capacity decrement, not a per-seat lock. This
  project only covers assigned-seating venues (which a "small or big"
  event can both be — many real concert halls and theatres do assign
  seats), and documents capacity-based GA as a distinct, bounded piece
  of future work rather than half-building it alongside seated venues.
- **Ratings/reviews and the waitlist ("notify me") for events.** Both
  `Rating` and `Waitlist` are `movieId`-scoped today. Extending them to
  also accept an `eventId` is a small, mechanical follow-up — it was
  left out of this pass specifically to keep this round's diff to "can
  you browse and book an event," not "every movie-only convenience
  feature also exists for events."

---

## GenAI features (Groq)

Three read-only AI features, all built on one shared Groq client
(`apps/api/src/services/aiService.ts`, env: `GROQ_API_KEY`, optional —
every feature checks `isAiConfigured()` first and degrades gracefully to
a "not configured" response rather than crashing, the same posture as
this app's existing Stripe/OMDb/Resend integrations). Model:
`openai/gpt-oss-120b` (see INTERVIEW_NOTES.md for why, and for the real
bugs hit getting here).

### Review summarizer

`apps/api/src/services/reviewSummaryService.ts` — a movie's recent
`Rating` comments (minimum 3, otherwise it returns null rather than
summarizing a single opinion) go to Groq and come back as 3-4 short
bullet points, cached in Redis keyed on `movieId` + review count (a
cheap invalidation: any new review changes the count, so the cache key
changes with it, no explicit invalidation logic needed). Exposed at
`GET /api/movies/:id/review-summary`. On `MovieDetailPage.tsx` this
renders as a small "✨ AI Summary" card with a disclosure caption, and
renders nothing at all when there's too little review data to
summarize.

### Mood search — describe what you're in the mood for

`apps/api/src/services/aiSearchService.ts` takes a free-text query
("something light and funny for a Friday night") and hands Groq the
whole bookable catalog directly in the prompt (`id|type|title|genre|
description`, one compact line per title) rather than building a
vector-embedding/pgvector pipeline — at this catalog's actual scale
(dozens of titles), sending the whole thing inline is simpler and
cheaper than standing up new embedding infrastructure for a search that
runs occasionally. Exposed at `POST /api/ai/search`. Frontend:
`apps/web/src/components/MoodSearch.tsx`, a card above "Now Showing" on
`HomePage.tsx`, deliberately separate from the existing exact-match
search bar rather than replacing it.

### Conversational booking assistant

`apps/api/src/services/assistantService.ts` is an agentic tool-use loop
(OpenAI-style function calling against Groq) with four **read-only**
tools: `search_catalog`, `get_showtimes`, `get_active_offers`,
`get_wallet_balance`. The hard safety rule, enforced structurally and
not just by prompting: the assistant has no tool that can write to
`Booking`/`BookingSeat`/`PaymentIntent` — it can only recommend and hand
off with a real markdown link (e.g. `[Book Inception](/shows/abc123/
seats)`) into the existing, already-safe seat-hold → Stripe → confirm
checkout flow. A person always clicks through and pays themselves; the
model can never spend money, because it was never given a tool that
could. Exposed at `POST /api/ai/chat`. Frontend:
`apps/web/src/components/ChatWidget.tsx`, a lazy-loaded floating
bottom-right FAB with an expandable chat panel, mounted in `App.tsx`,
with a small hand-rolled `[label](/path)` + `**bold**` renderer (no
markdown dependency) that turns links into real react-router `Link`s.

---

## Performance and SEO

### Route-level code splitting

Every page in both `apps/web` and `apps/admin` is `React.lazy()`-loaded
(`App.tsx` in each, wrapped in one `Suspense`) instead of bundled into
a single chunk. Concretely, the customer app's home page used to
download and parse ~440KB (gzipped) of JS on first visit — every other
page, Stripe Elements, and the ticket-PDF pipeline (`jsPDF` +
`html2canvas`, ~180KB gzipped combined) included, whether or not that
visit ever touched any of it. It now downloads ~200KB gzipped (verified
directly — a real browser session against the production build loads
exactly `vendor` + shared runtime + `HomePage`'s own chunk, nothing
else). `jsPDF`/`html2canvas` are dynamically imported inside
`downloadTicketPdf.ts` itself, so they're fetched only when someone
actually clicks "Download PDF," not on page load. The admin app's
`AnalyticsPage` (the only page using the `recharts` charting library)
is isolated the same way, so the other eleven admin pages no longer pay
for it.

`vite.config.ts` in both apps also sets `manualChunks` to keep
React/MUI/Emotion in one stable "vendor" chunk, separate from per-page
code — vendor code changes far less often than app code, so a browser
that's already cached it doesn't need to re-download it on the next
deploy.

### Rendering — memoization where it actually matters

`MovieCard` (rendered a dozen+ times per grid) and the seat-map's
`SeatCell` (50-100+ per screen) are wrapped in `React.memo`. The seat
map specifically: Redux Toolkit's Immer-based reducers only mutate the
one seat a socket event actually touched, so every OTHER seat keeps
the exact same object reference — combined with a `useCallback`-
stabilized click handler (a fresh arrow-function prop is what would
otherwise silently defeat `memo` regardless of how stable `seat`
itself is), this means one seat's hold status changing no longer
re-renders the other ~50 unaffected cells. Movie/event poster images
use `loading="lazy"` + `decoding="async"` in grid contexts (never on a
detail page's single hero image, where lazy-loading would delay
exactly the element Lighthouse measures as Largest Contentful Paint).

### SEO

- **Per-page `<title>`** via a small `useDocumentTitle` hook — this is
  a client-rendered SPA with one static `<title>` in `index.html`;
  without this every route showed the same generic tab title, and
  (Googlebot specifically executes JS, so this matters for it even if
  not for simpler crawlers) the same title to any indexer.
- **JSON-LD structured data** (`JsonLd.tsx`) on movie and event detail
  pages — real `schema.org` `Movie`/`Event` markup (rating, genre,
  showtime/venue for events), not decorative; this is what a rich
  search result actually reads.
- **`robots.txt`**: `apps/web` allows indexing and points at
  `sitemap.xml` (covers the static/marketing routes only — movie/event
  detail pages are admin-managed and change too often for a static
  file to stay accurate; generating those from the live catalog is
  real, scoped follow-up work, not something to fake with a stale ID
  list). `apps/admin` explicitly disallows everything and ships
  `<meta name="robots" content="noindex, nofollow">` — an internal,
  login-gated console has no business in search results.

---

## What was deliberately cut (and why)

- **Real payment gateway with an async, webhook-confirmed flow.** The
  Stripe integration above is real (test mode) but still synchronous —
  a production system handling redirect-based payment methods (not just
  cards) or requiring 3D Secure would need `PENDING` bookings and a
  webhook-driven confirmation instead (see INTERVIEW_NOTES.md).
- **Drag-and-drop visual seat layout builder.** The admin seat layout
  editor is a form-based list (row/col/label/category per seat) — the
  brief explicitly calls a visual builder a nice-to-have, not required,
  and it would spend complexity budget on the admin app instead of the
  booking logic.
- **Docker / Kubernetes / message queues / GraphQL.** Not needed at this
  scale, and would obscure rather than showcase the concurrency design
  that's the actual point of the project.
- **Releasing a seat hold on socket disconnect.** Holds rely solely on
  the 5-minute Redis TTL, not on tracking which socket owns which
  session's holds. Wiring disconnect-triggered release correctly (across
  reconnects, multiple tabs sharing a sessionId, etc.) adds real
  complexity for a marginal UX improvement (a slightly faster seat
  release when someone closes their tab); the TTL is an adequate safety
  net and keeps the hold's ownership model (Redis key ↔ sessionId) fully
  independent of the transport (Socket.io connection) that reports it.

---

## Local setup

> Deploying this instead? See [DEPLOYMENT.md](./DEPLOYMENT.md) —
> `apps/web`/`apps/admin` to Vercel, `apps/api` to Render, no Docker
> needed. Two things had to change in the codebase to make that possible
> (a real dual CJS/ESM build for `packages/shared`, and environment-aware
> cookie settings for cross-domain auth) — both explained there.

### Prerequisites
- Node.js 18+
- PostgreSQL running locally, with a database created for this project
- Redis running locally

### Install

```bash
npm install   # installs all three apps + packages/shared via npm workspaces
```

### Configure environment variables

```bash
cp apps/api/.env.example apps/api/.env
# edit apps/api/.env if your Postgres/Redis connection differs from the defaults:
#   DATABASE_URL="postgresql://<user>@localhost:5432/showtime"
#   REDIS_URL="redis://localhost:6379"
#   JWT_SECRET="<anything for local dev>"
#   PORT=4000
#   WEB_ORIGIN="http://localhost:5173"
#   ADMIN_ORIGIN="http://localhost:5174"
#   OMDB_API_KEY=""    # optional — only needed for admin's "Import Movie".
#                      # Free key, emailed instantly, from https://www.omdbapi.com/apikey.aspx
#   RESEND_API_KEY=""  # optional — only needed for real email delivery.
#                      # Free key from https://resend.com/api-keys — without it,
#                      # OTP codes and ticket emails are logged to the console instead.
#   STRIPE_SECRET_KEY="" # optional — only needed for real (test-mode) payments.
#                        # TEST key (sk_test_...) from https://dashboard.stripe.com/test/apikeys
#                        # — without it, checkout falls back to the mocked payment flow.
```

`apps/web/.env` needs `VITE_STRIPE_PUBLISHABLE_KEY` (the matching `pk_test_...`
test key) to actually render the Stripe payment form once
`STRIPE_SECRET_KEY` is set server-side — without it, checkout still uses
the mocked fallback even if the server has a Stripe key configured.

`apps/web/.env` and `apps/admin/.env` point at the API (`VITE_API_URL`,
and `VITE_SOCKET_URL` for web) — see each app's `.env.example`.

### Migrate + seed

```bash
cd apps/api
npx prisma migrate dev   # creates all tables
npm run db:seed          # seeds movies/theatres/shows/demo users + a past booking for ratings
```

### Run everything

```bash
# from the repo root — runs api (:4000), web (:5173), admin (:5174) together
npm run dev
```

Or run any single app on its own:

```bash
npm run dev --workspace=apps/api
npm run dev --workspace=apps/web
npm run dev --workspace=apps/admin
```

### Demo credentials (from the seed data)

| Role | Email | Password |
|---|---|---|
| Admin (apps/admin) | `admin@showtime.dev` | `Admin123!` |
| Customer | `demo@showtime.dev` | `Demo1234!` |
| Customer (alt) | `sam@showtime.dev` | `Demo1234!` |

Sample guest booking (for "Find my booking"): reference `SHOW-GUEST1`,
email `jordan.guest@example.com`.

The demo user (`demo@showtime.dev`) already has a `CONFIRMED` booking
against a show whose `endTime` is in the past, specifically so the
rating feature can be demoed immediately — see "Rate this movie" on
whichever title the seed script resolved as the flagship movie (see
below — it's a real title, not a fixed name).

All three seeded accounts (`admin`, `demo`, `sam`) are pre-marked
`emailVerified: true` so demo logins skip the OTP step entirely — that
flow is still fully live for any *new* account registered through the
app. Seed data spans eleven Indian cities/towns across twenty-two
theatres (forty-four screens), so the home page's city filter has real
breadth to demonstrate — including **Krishnanagar**, a smaller real
West Bengal town added specifically so the "use my location" nearest-
city fallback (see above) has a genuinely close, real serviceable city
to resolve to from an even smaller nearby town, instead of jumping all
the way to a metro.

Also seeded: two demo coupons (`WELCOME10` — 10% off, `FLAT50` — ₹50
off, max 100 uses) and a 7-item F&B menu (popcorn/nachos/drinks/a
combo) so checkout's coupon field and food step have something real to
try immediately. Every seeded user gets a real, unique `referralCode`
(visible on their `/profile` page in the web app) — register a new
account with `?ref=<their code>` in the URL to see the referral bonus
paid to both sides on that new account's first confirmed booking. Also
seeded: 6 events (comedy, concert, theatre, sports, workshop), 2
sessions each — browse them at `/events`.

The 20 seeded movies (Inception, The Dark Knight, Interstellar, 3
Idiots, Dangal, Parasite, Oppenheimer, Barbie, and more — a deliberate
mix of Hollywood and Bollywood across several genres) are themselves
real data — posters, synopses, genres, and runtimes resolved live
through OMDb during seeding (falling back to a placeholder only if
OMDb is unreachable), not the random stock-photo placeholders this
project used before. **To get an even larger, ~65-title catalog** on
top of those twenty, log into the admin panel and click **"Populate
Popular Movies"** on the Movies page once (needs `OMDB_API_KEY`
configured — see above). This is a one-click action, not part of the
seed script itself, since it needs live network access and
a valid API key that a CI/offline seed run can't assume it has.

### Proving the concurrency handling

```bash
cd apps/api
npx tsx scripts/race-test.ts redis
npx tsx scripts/race-test.ts db
```

See [Race-condition handling](#race-condition-handling-the-centerpiece)
above for what each proves and how to reproduce the hold-expiry case
manually via `redis-cli`.

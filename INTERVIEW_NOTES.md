# Interview Notes

This document is written for one purpose: so you (the author) can explain
every significant decision in this project without hesitation in an
interview. It's organized by topic, each with the decision, the
alternative(s) considered, and why the alternative lost.

---

## 1. Project overview (30-second version)

ShowTime is a scoped-down movie ticket booking platform: browse movies and
showtimes, watch a seat map update live as other people select seats, hold
and book seats (solo or in a group), check out as a guest or a logged-in
user, rate movies afterward. Built specifically to get hands-on, portfolio-
grade experience with Redux Toolkit, Material-UI, Redis, Socket.io, and a
Turborepo monorepo — layered onto React/Node/Express/Postgres skills
already held professionally. The one piece of real engineering depth in
the project (as opposed to breadth-of-tools exposure) is the seat-booking
concurrency design — see section 4.

---

## 2. Why each major technology was chosen

### Plain React (Vite) instead of Next.js

The explicit goal of this project was hands-on Redux Toolkit experience.
Next.js's App Router pushes you toward server components and server
actions for data-fetching/mutation, which actively compete with
client-side Redux for the same job — you'd end up either fighting the
framework or barely using Redux at all. A plain React + Vite SPA has no
opinion about data-fetching, so Redux Toolkit (plus RTK Query) gets to be
the actual answer to "how does data get into components," not a second
system bolted on next to server components. This is also a genuine
architectural difference worth being able to articulate: a different
project already uses Next.js (with its middleware/Edge-runtime-constrained
JWT handling); this project is a plain Express API consumed by a
plain SPA, with no edge runtime constraints on the JWT/cookie logic at
all — auth middleware is ordinary Express middleware, nothing special.

### Redux Toolkit — RTK Query for server data, hand-written slices for booking-flow state

Two different kinds of state in this app want two different tools:

- **Server state** (movies, shows, ratings, booking history) is a cache of
  something the API owns. RTK Query's job is exactly this — request
  dedication, cache invalidation by tag, loading/error states — and
  writing that by hand with plain thunks would just be reimplementing RTK
  Query, worse.
- **The booking flow's client-only state** (which seats *this* browser
  tab currently holds, the countdown, the cart) isn't a cache of server
  state — it's genuinely client-side, event-driven (seat hold results
  from the REST call, live updates from Socket.io) state machine logic.
  That's a hand-written slice with explicit actions
  (`seatHeldLocally`, `applySeatHeldEvent`, `applySeatBookedEvent`, ...)
  specifically because an interviewer asking "walk me through this slice"
  should get a clear, explicit answer, not "RTK Query's cache does
  something." This is also just a more honest demonstration of Redux
  Toolkit fundamentals (actions, reducers, `createSlice`) than an app that
  used RTK Query for everything.

### Material-UI (MUI)

Chosen because it's a widely-used component library the author hadn't
used professionally before, and it forces real component-composition
decisions (the seat-map grid isn't a native MUI component — it's built
from `Box`/`Button`/`Tooltip` primitives) rather than just wiring up
prebuilt widgets.

### Redis — three distinct jobs, not one

Redis does three unrelated things in this system, and it's worth being
able to name why each needs *this* tool specifically rather than "Redis is
fast":

1. **Seat holds** — `SET NX EX` gives atomic acquire-with-TTL as a single
   command. No polling, no cleanup job for abandoned holds.
2. **Socket.io's Redis adapter** — pub/sub is what lets `io.to(room).emit`
   reach sockets connected to a *different* API process. This is the one
   that's "for later" (see below) rather than load-bearing at the current
   single-instance scale, and it's worth being upfront about that
   distinction rather than overselling it.
3. **Read-path caching** (e.g. a show's seat-availability summary) — the
   most conventional Redis use case, included so the codebase isn't
   pretending Redis is *only* useful for locks and pub/sub.

### Socket.io + the Redis adapter

See README's "Why Socket.io + the Redis adapter specifically" — the short
version: rooms scoped per `showId` are exactly what a "seat map that
updates live for everyone watching this show" needs, and the Redis
adapter is the one thing standing between "works on my machine with one
Node process" and "works if this ever runs behind a load balancer."

### Prisma (vs raw `pg` + hand-written SQL)

Both were genuinely viable for the transactional core — `prisma.$transaction`
and a raw `BEGIN; ...; COMMIT;` block are equally explicit about what's
happening. Prisma won for the *rest* of the codebase: the admin CRUD
routes (movies, theatres, screens, shows, pricing) are numerous and
would be meaningfully more verbose as hand-written SQL, and Prisma's
generated types remove an entire category of "does this column exist"
bugs across ~15 models. The one real cost: Prisma's schema language has no
partial/filtered unique index, which shaped the seat-release-on-
cancellation design (see section 4) — a real, worth-mentioning trade-off,
not a hidden one.

### Turborepo + npm workspaces

Chosen over a from-scratch monorepo (manual `tsconfig` path mapping, no
task runner) because the specific pain point it solves — running
`dev`/`build`/`lint` across three apps + one shared package, sensibly
parallelized and cached — is exactly the pain a monorepo tool exists for,
and it's a tool worth having hands-on exposure to. `packages/shared` is
plain TypeScript source (no build step) consumed directly by all three
apps through the workspace symlink — Vite (web/admin) and `tsx` (api) both
transform TypeScript from that resolved path directly, so there's no
"build shared, then build the app that imports it" step to get wrong
during development. `turbo build` does compile it (see `turbo.json`'s
`dependsOn: ["^build"]`) for the production build path.

### External movie data — why it's an admin-side import, not a live data source, and why it survived a provider swap for free

An early version of this project used entirely placeholder movie data
(hand-typed titles, `picsum.photos` placeholder posters). The fix isn't
"call a movie API from the customer app" — `Booking`, `BookingSeat`, and
`Rating` all have foreign keys into `Movie.id`, so the catalog has to be
something this system owns; a booking's history must never be able to
break because a third party renamed a movie or went down. Instead, it's
wired in as an **admin data-entry convenience**:
`apps/api/src/services/externalMovieService.ts` proxies a search/details
API, and an admin "Import Movie" action **upserts a local `Movie` row**
(keyed on a nullable+unique `Movie.externalId` column) with the real
title/overview/poster/runtime/genre. From that instant on it's an
ordinary local row — editable, bookable, ratable — the external source is
never consulted again for it. This is the same "external system as
input, local system as source of truth" pattern you'd use for any admin
tool ingesting from a vendor API, and it's worth naming explicitly as a
deliberate boundary, not an oversight that a real architecture review
would flag.

This project actually swapped the backing provider once (TMDB → OMDb,
when TMDB access turned out unreliable from this deployment's network) —
and it cost exactly two files (`externalMovieService.ts`'s implementation,
and the admin UI's copy). That's a direct payoff of naming the module,
route (`/api/admin/external-movies`), and column (`Movie.externalId`)
after the *role* they play rather than the vendor implementing them —
worth pointing to as a concrete example of an abstraction earning its
keep, not being added speculatively "in case we ever need it."

**Why a curated-title bulk import instead of a "trending now" feed?**
Because OMDb structurally can't do the latter — it only supports exact
lookups (by id or by title), with no discovery/trending/popular endpoint
at all (TMDB has one; that's a real, structural difference between the
two APIs, not a configuration gap). Given that constraint, the honest
options were: (a) keep the catalog small and hand-curated, (b) pay for a
discovery API, or (c) resolve a curated list of ~65 well-known real
titles through OMDb's per-title lookup. (c) was chosen because every
imported record is still genuinely real data (poster, runtime, genre,
synopsis) — only the *selection* of which titles to ask for is static,
which is an honest, bounded trade-off to state explicitly rather than a
compromise to gloss over.

**Why is there no live/dynamic source for theatres, screens, or
showtimes, the way there is for movies?** Because that data doesn't
exist as a free public API anywhere — it's the proprietary operational
data of platforms like BookMyShow and individual cinema chains. This is
a good distinction to be able to draw crisply in an interview: movie
*metadata* (title, poster, synopsis) is commodity information plenty of
free APIs expose; *which theatre is showing what, when, at what price*
is commercially sensitive business data that isn't. The theatre/screen/
show dataset in this project (`prisma/seed.ts`, spanning ten cities) is
therefore explicitly curated and admin-maintained — not a placeholder
for "should eventually be live," but a permanent characteristic of the
problem, the same way it would be for a real regional cinema operator's
own internal booking system.

### Search Movies vs Now Showing — why this had to become two pages, not one flag

The clearest sign the original single-list design was wrong: clicking a
bulk-imported real movie with no scheduled shows led nowhere, with no
explanation. The fix wasn't "add a message for that case" — it was
recognizing these are two different questions with two different data
sources: "what's in the catalog" (optionally narrowed to `bookable=true`,
i.e. has an upcoming `Show`) versus "what does a real movie database
know about any title, whether or not ShowTime has ever heard of it"
(the public `/discover` endpoints, proxying OMDb directly, entirely
independent of the local `Movie` table). Collapsing these into one
page/endpoint with a flag would have kept inviting exactly the bug that
prompted the split — a browsable result rendered as if a purchase path
existed. Two pages with two clearly different jobs made that bug
structurally harder to reintroduce, which is a better fix than adding a
guard clause to the single combined view.

### Real city data + geolocation — and the one thing that still isn't "real"

`GET /api/locations/india-cities` (a real ~4,267-city list, free public
API) and browser geolocation + reverse-geocoding solve the "make the city
picker feel real" ask directly — genuinely live, real third-party data,
cached sensibly (24h Redis TTL for the city list, since a country's
cities don't change day to day). This is intentionally a SEPARATE data
source from `GET /api/theatres/cities` (the smaller, curated list of
cities ShowTime actually operates in) — picking a real city ShowTime
doesn't serve is expected and handled honestly (a plain "not available
here yet" message), not hidden.

### Real theatre locations (OpenStreetMap) vs. real showtimes (impossible) — a line worth drawing precisely

The first pass at this project claimed theatre/show data had "no free
public source at all" — that turned out to be only half true, and it's
worth being exact about which half. **OpenStreetMap** (free, open,
`amenity=cinema` tags) genuinely does publish real cinema locations —
actual chain names (PVR, INOX, Cinépolis) and addresses, crowd-sourced
and open-licensed. The admin "Import Real Theatre" flow
(`theatreDiscoveryService.ts`) uses this: geocode a city via Nominatim to
get a bounding box (robust against naming variants like "Bangalore" vs
OSM's "Bengaluru" — matching Overpass's `area[name=...]` by exact string
is fragile, a bounding box query isn't), then query Overpass for cinema
nodes in that box. A theatre's **existence and location** can therefore
be genuinely real now.

What still has **no free source anywhere, and structurally can't**: which
movie is showing at which real theatre, when, at what price. That's the
actual proprietary product BookMyShow and cinema chains sell — no
volunteer-mapped open dataset covers it, for the same reason no one maps
a competitor's live pricing data. So `Show` rows remain admin-curated;
the "Auto-schedule Shows" bulk action is explicitly fast admin tooling
(distributes admin-picked movies across screens lacking a show), never
described as fetched or live.

Being able to state this distinction precisely — "location, yes;
schedule, no, and here's the specific reason each is true" — after
initially overstating the limitation is a better answer than either
getting it right immediately (less interesting) or continuing to
overclaim (worse). It demonstrates correcting course when a stated
constraint turns out to be wrong, which is a more valuable interview
signal than never being wrong in the first place.

### Selected city as its own persisted slice — a real bug, and why the fix is a slice, not a prop

A concrete UX bug surfaced during review: picking a city on the home page
had zero effect once you clicked into a specific movie — its shows list
showed every theatre in every city, silently ignoring the filter you'd
just set. The fix is `GET /api/movies/:id/shows?city=` on the backend
(trivial), but the more interesting decision is where the "selected
city" lives on the frontend: its own Redux slice, persisted to
`localStorage`, rather than prop-drilled or hoisted only as far up as
whatever page happens to need it next. The reasoning: "which city am I
browsing" is session-wide user context — closer to "who am I logged in
as" than to page-local UI state — so it should survive both navigation
between pages and a full page reload, the same way login state does.
Making it a page-local `useState` on the home page would have "fixed"
the immediate bug (pass it as a route param or prop) while leaving the
same class of bug latent for the next page that also needs to know the
user's city. The one non-negotiable UX rule paired with this: a
persisted default must always be visibly changeable on the page that
inherited it — otherwise "remembers your choice" reads as "trapped by
your choice."

### Forgot password — reusing the OTP mechanism, but namespaced by purpose

Password reset (`POST /api/auth/forgot-password` /
`POST /api/auth/reset-password`) reuses the exact same Redis-backed OTP
mechanism as email verification, rather than building a second, parallel
system — same 6-digit code, same 10-minute TTL, same non-revealing
`204`-either-way response. The one real change: `otpService.ts`'s key
gained a `purpose` segment (`otp:{purpose}:{userId}`, `purpose` being
`"verify-email"` or `"reset-password"`), so a user who somehow has both
an unverified email AND a forgotten password at the same time doesn't
have one flow's code accidentally satisfy or invalidate the other. This
is a small, deliberate generalization made only when a second real
caller showed up — the original `otpService.ts` was written for exactly
one purpose, and reaching for an abstraction (a `purpose` parameter)
only once there were actually two call sites needing it, not
speculatively when there was only one.

The other detail worth naming: verifying the code and setting the new
password happen as one atomic action (`resetPassword()`), not two steps
("verify code" then separately "now set password"). A design that
split those would leave a window where a successfully-verified code is
sitting around as a de facto standing credential — anyone who intercepted
or guessed it could set the password at their leisure. Collapsing them
means the code is consumed (deleted from Redis) in the same call that
uses it, with nothing left over.

### QR e-tickets — client-only, no new backend surface (mostly)

The QR code shown in the app (`qrcode.react`, rendered in `apps/web`)
encodes a plain-text ticket built entirely from fields already on
`BookingDTO` — no new API endpoint needed for the in-app display. This is
a good example of recognizing when a feature genuinely needs a backend
change (an external movie import does) versus when it's purely a
rendering concern (the in-app QR isn't). The *emailed* copy of the same
ticket DOES need a backend change — generating a QR image server-side
(the `qrcode` npm package) to attach to an email is not something the
browser can do on the server's behalf — which is exactly the distinction
worth drawing explicitly: "does this need new server logic, or can the
client compute it from data it already has" is a real design fork, not a
detail to wave past. What a *scanning* flow (theatre staff checking a
ticket in) would need instead is described in the README and left
unbuilt: encode a verification URL, not raw details, and add an admin
"scan to verify"
screen that looks the reference up server-side.

### Email OTP verification — informational, not an access gate

`User.emailVerified` and the OTP flow (`otpService.ts`, `emailService.ts`,
`POST /api/auth/verify-email`/`resend-otp`) were added because "there's
no way to verify a user's email" was a fair gap in the original design.
The scope decision worth being explicit about: verification does **not**
block login, booking, or rating in this implementation — a user is
logged in immediately at registration, verified or not. This was a
deliberate choice to keep a new, independent feature from reaching into
the booking transaction's already-carefully-scoped logic (see §4) just to
add an unrelated business rule. A production app would likely gate
*something* on verification (at minimum, maybe rating — since rating
already requires an account, "requires a *verified* account" would be a
one-line change to the eligibility check in `ratings.routes.ts`) — it's
called out here as the natural next increment, not built, because adding
it wasn't asked for and every additional gate is one more place the
concurrency-critical paths could accidentally be touched by unrelated
work.

The OTP itself lives in Redis (`emailverify:{userId}`, 10-minute TTL) —
the same `SET ... EX` self-expiring-key pattern as seat holds, reused
because it's the same underlying problem ("a short-lived value that
should clean itself up") rather than because Redis is being used
gratuitously everywhere. Emailing it is fire-and-forget: registration
succeeds whether or not the email actually sends (same non-negotiable
posture as the booking ticket email — see the QR section above and
README's "Real email delivery").

---

## 3. Database relationships (see README for the full diagram)

The one relationship worth walking through carefully: `Show` →
`ShowSeatPrice` → price is per-show-per-category, not on `Seat`. This
means the same physical seat literally has no fixed price at all — its
price only exists in the context of a specific show. This is realistic
(weekend prices differ from weekday) and it's also why `BookingSeat`
snapshots the price at booking time (`BookingSeat.price`, and again in
`Booking.seatsSnapshot`) rather than joining back to `ShowSeatPrice` when
displaying a past booking — if a show's pricing were edited after the
fact (not currently exposed in the admin UI, but there's no schema reason
it couldn't be), historical bookings must not silently change price.

---

## 4. Deep dive: race-condition handling

This is the section to spend the most interview time on. The README has
the full mechanical walkthrough; here's the "why" framing to lead with.

### The framing

"I have two layers, and they solve different problems. Redis is the UX
layer — it makes the seat map feel instant and prevents the *obvious*
race (two people clicking the same seat) before it ever reaches the
database. Postgres's unique constraint is the correctness layer — it's
what's actually true regardless of whether Redis did its job."

### What happens without the Redis lock?

Every seat selection would need to hit Postgres to check-then-reserve,
and under real concurrency a naive check-then-insert has a race window
between the SELECT and the INSERT — exactly the bug this whole design is
about avoiding. You *could* solve that with `SELECT ... FOR UPDATE` or
`SERIALIZABLE` isolation on every single seat click, but that means a row
lock (or a retry-on-serialization-failure loop) held across the entire
time a user is looking at the seat map deciding — that's a bad trade,
since most seat "holds" never become bookings. Redis's `SET NX EX` gives
near-zero-cost, non-blocking reservation for the common case (someone
picks a seat, looks at it, maybe changes their mind) and reserves
Postgres's transactional machinery for the moment that actually needs it:
confirming payment.

### What happens without the Postgres unique constraint?

Nothing stops a genuine double-booking the moment Redis is wrong about
anything: restarted (lock lost, but the *intent* to book might already be
in flight from two different requests), a TTL that raced with a slow
checkout, or (at scale) a brief partition between API instances. Without
the constraint, both requests' application code would believe they're
clear, and you'd get two `BookingSeat` rows for the same seat — an actual
sold-twice ticket. The unique constraint turns "the application believed
X" into "the database enforces X is true," which is the only place a
guarantee like this can actually live.

### Why both — the answer that shows you understand defense in depth

"Redis makes the common case fast and pleasant. Postgres makes the rare
case *impossible*, not just unlikely. I could ship only the Postgres
layer and the system would still be correct — just with a worse UX,
because every rejected double-click would only surface after a full
transaction round-trip. I could not ship only the Redis layer, because
Redis being wrong is not actually rare at scale (restarts, TTL races,
partitions) — it's the exact profile of bug that's invisible in a demo
and expensive in production."

### The two demonstrable scenarios, and how to talk about them

1. **Two users click seats that don't overlap** — no conflict, this is
   the 99% case, both succeed, nothing interesting. Worth saying out loud
   so it's clear you know this ISN'T where the interesting behavior is.
2. **Two users try to select the *same* seat** — Redis's `NX` rejects the
   second one immediately (409, before any DB work). This is what a
   two-browser-tab demo shows.
3. **A hold expires mid-checkout** — `checkHoldsOwnedBy` runs before the
   transaction and catches this with a specific, actionable 409. Reproduced
   manually via `redis-cli del` (see README) since a real 5-minute wait
   isn't demo-friendly.
4. **Redis is bypassed/wrong entirely** — this is what `scripts/race-test.ts db`
   demonstrates directly: two concurrent Postgres transactions,
   Redis check skipped on purpose, racing to insert the same
   `(showId, seatId)`. One wins, one gets a clean `P2002` rejection. This
   is the scenario that *actually* justifies the unique constraint's
   existence, since scenario 2 above means two valid Redis holds on the
   identical seat basically can't happen in the first place.

### Group bookings are "free" from this design

A 4-seat group booking is just `seatIds.length > 1` going through the
exact same transaction. `bookingSeat.createMany([...])` failing as one
statement if *any* row conflicts is what makes it atomic — there's no
seat-by-seat loop with its own commit, so there's no way to end up
having "booked 3 of 4 seats." This wasn't extra work; it fell out of
doing the single-seat case correctly.

### Where Stripe fits into this design — and why it changes nothing

Adding real (test-mode) Stripe payment could easily have complicated the
centerpiece design above; it didn't, because it slots into the exact
spot the mocked payment check already occupied — a gate BEFORE the
transaction, never inside it. `confirmBooking()`'s shape is unchanged:
re-check the Redis hold → verify payment → run the atomic transaction.
Whether "verify payment" means checking a boolean flag or re-fetching a
real PaymentIntent from Stripe's API is a private implementation detail
of that one step; nothing about the Redis/Postgres concurrency guarantee
cares which one is active. This is a good example of a system boundary
holding up under a real feature addition rather than needing to bend —
worth pointing to directly if asked "how do you know your design doesn't
just work for the toy version of the problem."

Two things do differ from the mock, deliberately:
- **The server never trusts the client's claim that payment succeeded.**
  It re-fetches the PaymentIntent from Stripe directly and checks status,
  amount, and metadata (showId + a sorted seat-id key) match this exact
  attempt — otherwise a client could simply lie (`paymentIntentId:
  "fake"`, or replay someone else's successful payment for a different
  cart).
- **A PaymentIntent can only ever be attached to one booking**
  (`Booking.paymentIntentId` is `@unique`) — checked explicitly (a clear
  409) rather than left to surface as a confusing seat-conflict error if
  it ever collided with the existing unique-constraint-violation handler.

A real bug this project's own testing caught: sending a fabricated
`paymentIntentId` (one Stripe has never heard of) initially crashed into
a generic 500 — Stripe's SDK *throws* for a not-found id rather than
resolving with an error status, and that exception wasn't being caught,
so it fell through to the catch-all error handler instead of a clean
client error. Fixed by wrapping the `retrieve()` call and mapping that
specific failure to a 400 ("bad input," not "server broke"). Worth
mentioning as a concrete example of the general rule "a third-party
SDK's failure mode is part of your contract with it too, not just its
happy path" — the fix was one small `try/catch`, but finding it required
actually testing the adversarial case (a curl with a made-up id), not
just the happy path.

### Coupons, food, and wallet — extending the pricing pipeline without touching the transaction

The same "gate before the transaction, never inside it" lesson from
Stripe above applies again to every later addition — coupons, F&B
add-ons, and wallet spend all resolve to a single `finalAmount`
*before* `confirmBooking`'s atomic transaction even opens; the
transaction itself only ever sees one number to charge and one set of
already-validated line items to persist.

The discipline that actually prevents bugs here is narrower than that,
though: `create-payment-intent` (which tells Stripe how much to
charge) and `confirm` (which re-verifies that charge before booking
anything) call the *exact same* pricing functions —
`computeSeatsPricing` → `applyCoupon` → `computeFoodCart` → wallet
deduction — in the exact same order. I actually hit the bug this
guards against while building it: I added food items and wallet
support to `confirmBooking()` first, tested it in isolation, and it
worked — but `create-payment-intent` still only knew about seats and
coupons, so it created a Stripe PaymentIntent for the *wrong* (too
low) amount the moment a food item was added. `confirmBooking`'s
independent recomputation caught the mismatch correctly (that's the
whole point of never trusting the client) and rejected the booking —
which is the right failure mode, but it meant checkout was broken for
anyone who added a snack. The fix was mechanical once diagnosed: make
`create-payment-intent` run the identical pricing pipeline. Worth
mentioning as a real example of "two callers computing the same value
must call the same function" not being a style preference — it's the
difference between a feature working and silently failing at the last
step, and it's exactly the kind of drift that's easy to introduce
piecemeal (I built the confirm-side logic first) and only surfaces
under an end-to-end test, not a unit test of either endpoint alone.

The wallet ledger follows the same "one function, all writers" rule:
every balance change (spend, refund, referral bonus) goes through
`adjustWallet`, which updates the denormalized `User.walletBalance`
and appends a `WalletTransaction` row in the same DB transaction —
so the cached balance is provably never out of sync with the ledger
it's derived from, the same reasoning as `Booking.seatsSnapshot` being
a point-in-time copy rather than something recomputed from
possibly-since-changed data.

---

## 5. Security considerations

- Passwords hashed with bcrypt (10 salt rounds), never returned in any
  API response (Prisma's generated types include `passwordHash`, but
  every route hand-builds its response DTO rather than spreading the
  Prisma row, so it can't leak by accident).
- JWT in an httpOnly cookie (not localStorage) — not reachable by
  injected JS, mitigating XSS-driven token theft. `sameSite: "lax"`.
- **Two cookie names** (`st_customer_token`, `st_admin_token`) because the
  admin app and customer app are different frontends hitting the *same*
  API origin — cookies are scoped by the domain that set them (the API's
  domain), not by which frontend triggered the request. One cookie name
  would mean logging into the admin panel in one tab silently clobbers a
  customer session in another tab of the same browser talking to the same
  API. This is a real, non-obvious bug class worth naming proactively.
- Guest booking lookup (`POST /api/bookings/find`) returns the same 404
  whether the reference is wrong or the email doesn't match — otherwise
  the endpoint becomes an oracle for enumerating valid reference codes or
  confirming which email a booking belongs to.
- Rating eligibility and booking ownership (cancel, "my bookings") are
  enforced server-side against the authenticated user's ID from the JWT,
  never trusted from the request body.
- `express-rate-limit` on both login endpoints (customer + admin),
  windowed 15 minutes / 20 attempts, to blunt credential-stuffing without
  needing a separate service.
- Every write endpoint validates its body with a Zod schema from
  `packages/shared` before touching the database — the same schema the
  frontend forms could (and in this project, do) reuse for client-side
  validation, so the two never drift.

---

## 6. Performance considerations

- The seat map's read path (`GET /api/shows/:showId/seatmap`) does one
  Postgres query for booked seats plus a Redis pipeline (`MGET`-equivalent
  via a pipelined `GET` per seat) for holds — O(seats) Redis round-trips
  collapsed into one pipeline, not N sequential round-trips.
- `Movie.averageRating` is computed on read via aggregate (see README) —
  a deliberate simplicity-over-scale trade documented as such, not an
  oversight.
- The Redis adapter for Socket.io means the real-time layer scales
  horizontally without touching application code — see the monorepo/tools
  section above.
- No N+1 query patterns in list endpoints — Prisma `include` is used to
  fetch relations in the same round trip (e.g. shows with their
  screen/theatre/prices) rather than looping and querying per row.

---

## 7. What I'd improve for production

- **An async, webhook-confirmed payment flow.** Payment IS now real
  Stripe (test mode) — see the new section below — but it's still
  *synchronous*: the client confirms with Stripe.js and the server
  re-verifies the resulting PaymentIntent before booking, all within one
  request/response. A production system supporting payment methods that
  require a redirect (many bank transfer/wallet methods, or cards needing
  3D Secure) can't stay synchronous — you'd create a `PENDING` booking
  (this is exactly why the shared `BookingStatus` enum already includes
  `PENDING`/`FAILED` even though this implementation never persists
  them), reserve the seats, redirect to the payment provider, and only
  flip to `CONFIRMED` when their webhook confirms the charge — with a
  background job to expire/release `PENDING` bookings that never get
  confirmed. This is a meaningfully different, more complex design
  (webhook signature verification, idempotency on the webhook handler, a
  reconciliation job for missed webhooks) — correctly out of scope here,
  but worth being able to sketch, and worth being precise that "real
  Stripe" and "webhook-confirmed async flow" are two different
  improvements, not the same one.
- **Idempotency keys on `POST /api/bookings/confirm`.** A retried request
  (client-side retry on a flaky network, a double-click that the UI
  didn't debounce) currently could — if it somehow got past the hold
  re-check — attempt to book the same cart twice. An `Idempotency-Key`
  header, checked against a short-lived Redis key holding the previous
  response, is the standard fix.
- **Horizontal scaling for Socket.io.** The Redis adapter is already in
  place; what's missing for a real multi-instance deployment is sticky
  sessions (or a transport that doesn't need them) at the load balancer,
  since a client's Socket.io connection needs to consistently reach the
  same instance during the WebSocket upgrade handshake.
- **Structured logging + request tracing.** Currently just `console.error`
  on unhandled errors; a real deployment wants request IDs threaded
  through logs (especially valuable for debugging a reported
  double-booking-that-didn't-happen-because-the-constraint-caught-it).
- **Releasing holds on socket disconnect**, not just TTL expiry — noted
  in the README as a deliberate cut; worth revisiting if the 5-minute
  window ever felt too long in real usage data.

---

## 8. Monorepo / Turborepo mechanics

- `turbo.json` defines `build`, `dev`, `lint`, `typecheck` pipeline tasks.
  `build` has `dependsOn: ["^build"]` — the `^` means "this task's
  dependencies' `build` task first," which is what makes
  `packages/shared` build before any app that needs its compiled output
  (this became load-bearing, not hypothetical, once `packages/shared`
  gained a real build step for deployment — see below). `dev` is marked
  `cache: false, persistent: true` since a dev server never "completes"
  and its output shouldn't be cached.
- npm workspaces (`"workspaces": ["apps/*", "packages/*"]` in the root
  `package.json`) is what makes `@showtime/shared` resolvable from
  `apps/web`/`apps/admin`/`apps/api` as a normal package import — npm
  symlinks `packages/shared` into each consumer's `node_modules`.
  `packages/shared` ships a real dual build (`dist/cjs` + `dist/esm`, see
  "Deployment architecture" below) rather than being consumed as raw
  source — in local dev, its own `dev` script runs `tsc --watch` for
  both targets in the background (via `turbo dev`, since it's just
  another workspace with a `dev` script), so editing shared code still
  hot-reloads dependent dev servers with no manual rebuild step; that
  watch process is what changed, not the fact that a build exists at all.
- Each app is independently runnable (`npm run dev --workspace=apps/api`)
  specifically so you can demo just the API + `curl`/Postman without the
  frontends, or debug one frontend against a separately-running API.

## 9. Deployment architecture (Vercel + Render, no Docker)

Full details in `DEPLOYMENT.md`; the two decisions worth being able to
explain from memory:

**No Docker.** Both target platforms build directly from source — Vercel
runs a Vite build and serves static output, Render runs a plain Node
build/start command against the repo. Docker earns its keep when you need
byte-identical environment parity across many services, or you're
targeting infrastructure that specifically wants a container (Kubernetes,
Fly.io). Neither applies here — adding it would be pure ceremony around
two platforms that already own the runtime concern.

**`apps/api` has to be a persistent process, not serverless.** This is
the one hard constraint that shapes the whole layout: Socket.io needs a
long-lived connection per client, which a serverless/edge function
platform (Vercel included) fundamentally can't hold — a function
invocation ends, the connection would drop. That's why the API goes to
Render's "Web Service" (an always-on process) rather than, say, Vercel
serverless functions, even though Vercel would have been the simpler
single-vendor answer if the app didn't need real-time.

**The two code changes deployment actually forced** (detailed in
`DEPLOYMENT.md`, and worth being able to explain *why* each was
necessary, not just that it was made):
1. `packages/shared` needed a real, dual-format build (CJS for `apps/api`'s
   plain-`node` runtime, ESM for Vite/Rollup) — discovered concretely when
   a CJS-only build made `apps/admin`'s production `vite build` fail with
   a rollup error ("SEAT_CATEGORIES is not exported"), because Rollup's
   static export analysis doesn't reliably see through TypeScript's
   CommonJS re-export helpers (`export * from "./constants"` compiles to
   `Object.defineProperty` getters, not plain assignments Rollup can
   trace as easily as a native ESM `export`). This is a good story about
   testing an assumption rather than trusting it: the CJS-only build
   type-checked fine and even ran correctly under `node` — it only broke
   in a specific bundler's specific static-analysis pass, which nothing
   short of an actual production build would have surfaced.
2. Auth cookies became environment-aware (`SameSite=Lax` locally,
   `SameSite=None; Secure` in production) because Vercel and Render are
   genuinely different domains — `Lax` cookies aren't attached to
   cross-origin fetch/XHR calls at all (only top-level navigations), so
   without this fix, login would have appeared to succeed (the response
   sets the cookie) while every subsequent authenticated request silently
   had no cookie attached — a bug that's easy to miss testing locally,
   since `localhost:5173` calling `localhost:4000` doesn't trigger it.

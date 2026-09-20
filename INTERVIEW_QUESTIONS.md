# Interview Questions

Grouped by topic. Each question has a short answer (the one-sentence
version), a deeper explanation, and a follow-up question an interviewer
might push with next. Extra weight is given to Redis/concurrency, since
that's this project's signature feature.

---

## Project

**1. What does ShowTime do, in one sentence?**
*Short:* A scoped-down movie ticket booking platform with a live seat map
and race-condition-safe booking.
*Deeper:* Browse movies/showtimes, hold and book seats solo or in a group,
guest or logged-in checkout, rate movies after watching, plus a separate
admin panel for the catalog.
*Follow-up:* What's the one feature you'd point to as the most technically
interesting, and why?

**2. Why build this instead of a plain CRUD app?**
*Short:* To get real, defensible experience with concurrency handling
under load, not just wiring up forms.
*Deeper:* A CRUD app doesn't force you to reason about two requests
touching the same row at the same time; a booking system does, and that's
exactly the gap between "has built things" and "understands systems" in
an interview.
*Follow-up:* What would you add if you had another week?

**3. What's explicitly out of scope, and why?**
*Short:* Real payments, Docker/K8s, message queues, GraphQL, a visual
drag-and-drop seat layout builder.
*Deeper:* Each either adds complexity that doesn't showcase the
concurrency design (payments, infra) or spends the project's complexity
budget somewhere other than where it matters (the admin panel).
*Follow-up:* If you had to add a real payment gateway, what would change
architecturally?

**4. Why Postgres over MongoDB/a NoSQL store here?**
*Short:* The booking flow needs multi-row transactions and a real unique
constraint — that's a relational-database problem by nature.
*Deeper:* "Insert a Booking and N BookingSeat rows atomically, with a
uniqueness guarantee across concurrent writers" is exactly what ACID
transactions and unique indexes are for; modeling this correctly in a
document store would mean re-implementing transactional guarantees the
database doesn't give you for free.
*Follow-up:* Is there any part of this schema that would model naturally
as a document instead?

---

## React / Redux Toolkit

**5. Why RTK Query for some state and hand-written slices for other state?**
*Short:* RTK Query for server-owned data (it's a cache); hand-written
slices for genuinely client-only state (the booking flow).
*Deeper:* See INTERVIEW_NOTES.md §2 — using RTK Query for the booking flow
too would mean treating "which seats does this session currently hold" as
a server cache when it's actually a client-side state machine driven by
both a REST response and a stream of socket events.
*Follow-up:* Where's the line, in general, between "this belongs in an
RTK Query cache" and "this belongs in a plain slice"?

**6. Walk me through the booking slice's actions.**
*Short:* `setSeatMap`, `seatHeldLocally`/`seatReleasedLocally` (this
session's own actions), `applySeatHeldEvent`/`applySeatReleasedEvent`/
`applySeatBookedEvent` (socket-driven, other sessions), `clearBookingFlow`.
*Deeper:* The local-vs-applied naming split matters: a hold I initiate
comes back as an HTTP response I already know the outcome of; a hold
someone else initiates arrives asynchronously as a socket event I didn't
ask for. Conflating them would make it hard to reason about "did *I* just
hold this seat" vs "did the map just change under me."
*Follow-up:* How would double-hold — the same seat held twice by mistake
in local state — be prevented or detected?

**7. Why isn't the countdown timer stored in Redux?**
*Short:* A ticking clock is a rendering concern, not application state.
*Deeper:* Storing "seconds remaining" in the store means dispatching an
action every second just to force a re-render — Redux state should
represent facts (a hold expires at timestamp X), and the countdown is
derived from that fact against `Date.now()` in a component's own
`useEffect`/`setInterval`.
*Follow-up:* What's a case where you *would* want time-based state in the
store?

**8. Why plain React (Vite) instead of Next.js for this project?**
*Short:* Server components and Redux Toolkit compete for the same job;
avoiding that conflict was more valuable here than SSR.
*Deeper:* See INTERVIEW_NOTES.md §2.
*Follow-up:* Are there parts of this app that WOULD benefit from
server-side rendering?

**9. How does the frontend distinguish "held by me" from "held by
someone else" for the same seat status?**
*Short:* The seat map API/socket payloads carry `heldByMe: boolean`
alongside `status: "HELD"`.
*Deeper:* The server knows the requester's `sessionId` (from the
`X-Session-Id` header) and compares it against the Redis lock's owner
value when building the response — the client never has to guess based on
its own local state alone, which matters because the client's local state
could be stale relative to a page reload.
*Follow-up:* What happens if the same user opens the seat map in two
different tabs?

**10. Why MUI instead of a CSS framework like Tailwind?**
*Short:* Component-level abstractions (Stepper, Dialog, Rating) matched
this app's flows directly, and it was new tooling worth the hands-on
practice.
*Deeper:* The seat-map grid specifically isn't a prebuilt MUI component —
it's composed from `Box`/`Button`/`Tooltip` primitives, which is a
reasonable middle ground between "everything prebuilt" and "everything
hand-rolled CSS."
*Follow-up:* What would change about the seat-map component if it needed
to render 500+ seats instead of ~50?

---

## Node / Express / API design

**11. Why is there no `PENDING` booking status persisted anywhere?**
*Short:* Because "confirm" is one atomic transaction — it either fully
succeeds (write `CONFIRMED`) or fully fails (write nothing).
*Deeper:* `PENDING` exists in the shared enum for documentation/future-
proofing (a real async payment flow needs it as a real state), but this
implementation's mocked, synchronous payment never needs an
intermediate state.
*Follow-up:* What would the state machine look like with a real,
webhook-confirmed payment provider?

**12. Why is validation done with Zod in a shared package rather than
per-app?**
*Short:* So the frontend forms and the backend routes validate against
the literal same rules, and can't drift.
*Deeper:* `packages/shared/src/schemas.ts` is imported by `apps/api` for
`validateBody()` middleware and could equally be imported by
`apps/web`/`apps/admin` forms for client-side pre-validation — one schema,
one source of truth for "what does a valid register request look like."
*Follow-up:* What's a validation rule that genuinely needs to differ
between client and server, if any?

**13. Why does `asyncHandler` exist?**
*Short:* Express (pre-v5) doesn't forward rejected promises from async
route handlers to error middleware automatically.
*Deeper:* Without it, a thrown error inside an `async (req,res) => {...}`
handler becomes an unhandled rejection that hangs the request instead of
reaching `errorHandler.ts` — `asyncHandler` just wraps the handler and
calls `.catch(next)`.
*Follow-up:* What would change if this were upgraded to Express 5?

**14. Why does `ApiError` carry a numeric status AND a string code?**
*Short:* The status is for HTTP semantics; the code is for the client to
branch on programmatically without parsing message text.
*Deeper:* `message` is meant for humans (shown in a snackbar); `error`
(the code, e.g. `"CONFLICT"`) is meant for code — a frontend could check
`err.error === "CONFLICT"` to trigger seat-reselection UI specifically,
without depending on exact wording.
*Follow-up:* Would you version this error-shape contract? How?

**15. Why two separate cookie names for customer and admin auth instead
of one shared session?**
*Short:* They're different frontends hitting the same API origin; one
cookie name would mean one session silently overwrites the other in the
same browser.
*Deeper:* See INTERVIEW_NOTES.md §5 — cookies are scoped by the domain
that *sets* them (the API), not by which frontend made the request.
*Follow-up:* What's an alternative to two cookie names that would also
solve this?

**16. Why `express-rate-limit` only on auth endpoints, and not everywhere?**
*Short:* Auth endpoints are the highest-value target for brute-forcing;
rate-limiting everything would be a blunt instrument that could hurt
legitimate seat-holding traffic during a real "everyone's booking at
once" spike.
*Deeper:* The seat-hold endpoint, if anything, needs to handle *bursts*
of legitimate traffic well (popular show, many users), which is the
opposite of what you want a rate limiter optimizing for.
*Follow-up:* What WOULD you rate-limit beyond auth, and with what limits?

---

## PostgreSQL & transactions

**17. Walk me through exactly what's inside the booking transaction.**
*Short:* Create one `Booking` row, then `createMany` the `BookingSeat`
rows — both inside `prisma.$transaction`.
*Deeper:* See README "Layer 2" and INTERVIEW_NOTES.md §4 — the key detail
is that `createMany` fails as one statement on any unique violation, which
is what makes multi-seat group bookings atomic without extra code.
*Follow-up:* What isolation level does this run at, and does it matter
here?

**18. Why `@@unique([showId, seatId])` on `BookingSeat` and not on `Seat`
itself?**
*Short:* Because a seat's booked/available status is show-specific — the
same seat is bookable independently on every different show.
*Deeper:* A unique constraint on `Seat.id` alone would mean a seat could
only ever be booked once, period, across every show that ever uses that
screen — obviously wrong. The constraint has to be scoped to the
`(showId, seatId)` pair.
*Follow-up:* What if the same seat needed to be booked twice for the same
show under some hypothetical rule (e.g. a matinee + evening rebooking
window)? How would the schema need to change?

**19. Why doesn't cancellation use a `status` column + partial unique
index on `BookingSeat`?**
*Short:* Prisma's schema language doesn't support partial/filtered
indexes; instead, cancellation deletes the `BookingSeat` rows.
*Deeper:* See README's "Why cancellation doesn't need a partial/filtered
unique index" — the row's mere *existence* means "booked," so deleting it
means "not booked," and booking history is preserved separately via the
immutable `Booking.seatsSnapshot` JSON.
*Follow-up:* If you switched to raw SQL, would you use a partial index
instead? Why or why not?

**20. What does `Prisma.PrismaClientKnownRequestError` with code `P2002`
mean, and where is it caught?**
*Short:* A unique constraint violation; caught in `confirmBooking()`'s
try/catch around the transaction.
*Deeper:* On catching it, the code doesn't just return a generic error —
it runs a follow-up query for which seat IDs in the requested set are
already in `BookingSeat`, so the 409 response can name the specific
conflicting seats.
*Follow-up:* Could this follow-up query itself race with another booking?
Would that matter?

**21. Why is average rating computed on read instead of stored and
updated on write?**
*Short:* At this project's scale, an aggregate query per request is
trivial and guarantees the value is always exactly correct.
*Deeper:* See README/INTERVIEW_NOTES §2 — the trade-off is read cost vs.
write complexity + drift risk; documented explicitly as a scale-dependent
choice, not a default best practice.
*Follow-up:* At what point (roughly) would you flip this to write-time
computation, and how would you migrate existing data when you did?

**22. Why is `Seat.row`/`Seat.col` separate from `Seat.label`?**
*Short:* `row`/`col` is physical grid position (for rendering); `label`
is the human-readable seat number (for everything else) — decoupled so
layouts can have gaps.
*Deeper:* See README's schema section — the seed data actually generates
a real aisle gap (column 5 skipped every row) with dense sequential
labels, so the distinction isn't hypothetical.
*Follow-up:* How would you render a seat map where an entire row has a
gap in the middle — what does the grid component need to know to lay
that out correctly?

**23. Why is price stored on `ShowSeatPrice`, not on `Seat`?**
*Short:* The same physical seat can cost differently across different
shows.
*Deeper:* This also means `BookingSeat.price` is a snapshot at booking
time, not a live join — so a later price change never rewrites a past
booking's total.
*Follow-up:* How would you support a promotional discount applied at
booking time, given this schema?

---

## Redis & concurrency (extra depth — this is the signature topic)

**24. What does `SET key value NX EX 300` actually guarantee, and why
does that matter here?**
*Short:* Atomically sets the key only if it doesn't already exist, with a
300-second expiry — one command, no race window between "check" and "set."
*Deeper:* Without `NX`, two concurrent `SET`s could both "succeed" and the
second would silently overwrite the first's ownership — there'd be no way
to know which session actually "won" the seat. `NX` makes the acquire
itself atomic at the Redis server, so only one caller's `SET` ever
actually writes the key.
*Follow-up:* What would happen if you used `SETNX` + a separate `EXPIRE`
call instead of `SET ... NX EX` in one command? What's the failure mode?

**25. Why is the Redis hold check re-run right before the transaction
(`checkHoldsOwnedBy`) instead of trusting the earlier hold response?**
*Short:* Time passes between "seat selected" and "confirm clicked" —
sometimes minutes — and the hold could have expired or been released in
that window.
*Deeper:* This is exactly the "hold expires mid-checkout" scenario the
project is built to demonstrate — see README's reproduction steps via
`redis-cli del`.
*Follow-up:* Could you avoid this re-check by extending the TTL every time
the user interacts with the checkout form? What would that trade off?

**26. Why is the Postgres unique constraint necessary if the Redis hold
already prevents two sessions from holding the same seat?**
*Short:* Because Redis can be wrong — restarted, TTL-raced, or (at scale)
briefly partitioned — and the constraint is the one thing that's
unconditionally true regardless.
*Deeper:* This is the whole point — see INTERVIEW_NOTES.md §4's "framing"
section. Be ready to say explicitly: under *normal* operation, two
sessions can't even both acquire a hold on the same seat, so the
constraint mostly exists for the abnormal case.
*Follow-up:* Can you describe a concrete sequence of events, in this
specific codebase, where the Redis layer would let two sessions both
believe they can book the same seat?

**27. Walk me through `scripts/race-test.ts`'s `db` scenario exactly.**
*Short:* Two concurrent Prisma transactions, Redis check skipped on
purpose, both trying to insert a `BookingSeat` for the identical
`(showId, seatId)` — one commits, one gets `P2002` and is caught.
*Deeper:* An artificial `setTimeout` between creating the `Booking` row
and inserting the `BookingSeat` row widens the race window deliberately,
so both transactions are genuinely in-flight simultaneously rather than
one finishing before the other starts — otherwise the "race" might not
actually race given how fast local Postgres is.
*Follow-up:* Without that artificial delay, would the test still
sometimes catch a real race? Why might it not?

**28. Why use a Lua script (`releaseScript`) for releasing a hold instead
of a plain `GET` then `DEL`?**
*Short:* `GET` then `DEL` is two round trips with a race window between
them; the Lua script runs both as one atomic operation on the Redis
server.
*Deeper:* Without atomicity, a hold could expire (TTL) or be re-acquired
by someone else in the gap between your `GET` (confirming you own it) and
your `DEL` — and you'd delete a lock you no longer actually own, releasing
someone else's legitimate hold.
*Follow-up:* What Redis command(s) besides a Lua script could achieve the
same atomicity?

**29. Why does the seat map's Redis lookups use a pipeline instead of N
sequential `GET` calls?**
*Short:* A pipeline batches N commands into one round trip instead of N
round trips, which matters directly for the seat map's latency as seat
count grows.
*Deeper:* `getHoldsForShow`/`checkHoldsOwnedBy` in `seatHoldService.ts`
both build a pipeline and issue one `.exec()`, rather than `await`-ing a
loop of individual `redis.get()` calls.
*Follow-up:* At what seat count would this optimization actually be
noticeable versus premature?

**30. What's the actual role of the Socket.io Redis adapter in THIS
codebase, given it only runs one API instance locally?**
*Short:* It's currently a no-op in terms of behavior change, but it's the
one piece of infrastructure that makes horizontal scaling not require a
rewrite.
*Deeper:* Be upfront about this rather than overselling it — see README's
explicit callout. It's an honest, defensible answer: "I added the thing
that makes this architecture correct at scale, even though I'm
demonstrating it at scale 1."
*Follow-up:* What would you need to add, besides the adapter, to actually
run this API as 2+ instances behind a load balancer?

**31. What happens to a seat's Redis key if the API process crashes mid-
request, after `acquireHold` succeeds but before the response is sent?**
*Short:* Nothing — the key already exists in Redis, independent of the
API process; it just expires normally after its TTL.
*Deeper:* This is exactly why the hold lives in Redis and not, say, an
in-memory variable on the Express process — the lock's lifetime is
decoupled from any single request's or process's lifetime.
*Follow-up:* Is there a scenario where a crashed API process could leave
Redis and Postgres in an inconsistent state? Where would you look?

**32. Why is the seat-hold "session" concept (`X-Session-Id`) separate
from the JWT-based login session?**
*Short:* Guests need to hold and book seats without an account, so seat
ownership can't depend on being logged in.
*Deeper:* A logged-in user's `sessionId` and `userId` are two independent
identifiers used for two independent things — `sessionId` answers "who
holds this Redis lock," `userId` (from the JWT) answers "who owns this
booking, if anyone." A booking can have a `userId` and no explicit tie to
the `sessionId` that held the seats at all, once it's confirmed.
*Follow-up:* What happens if a user logs in partway through holding
seats, in the current design? What would you want to happen?

---

## Socket.io & real-time

**33. Why rooms scoped per `showId` instead of one global broadcast
channel?**
*Short:* A client watching Show A doesn't need (and shouldn't receive)
seat updates for Show B — rooms scope the broadcast to exactly the
audience that cares.
*Deeper:* At any real scale, broadcasting every seat event globally would
mean every connected client's browser processes irrelevant events
constantly.
*Follow-up:* How would you scope this further if a very popular show had
thousands of simultaneous viewers?

**34. Why is `booking:confirmed` broadcast to the whole show room instead
of just the booking user's own socket?**
*Short:* It doubles as the seat map's authoritative "these seats are now
booked" signal for everyone watching, not just a personal receipt.
*Deeper:* The booking client uses the same event to know its own booking
succeeded (matching on booking ID/reference client-side), so there's one
event type serving two purposes instead of two separate emits to
maintain.
*Follow-up:* Is there a privacy concern with broadcasting booking details
to the whole room? What does the payload actually contain?

**35. In what order do the database write and the Socket.io broadcast
happen, and why does that order matter?**
*Short:* Database commit happens first, always; the broadcast only
happens after the transaction succeeds.
*Deeper:* If the broadcast happened first (or the write and broadcast
happened concurrently), a client could see "seat booked" in the UI for a
booking that then fails to actually commit — a real UI lie. Committing
first means the real-time layer only ever announces something that has
already durably happened.
*Follow-up:* What would happen to a client's UI if the broadcast were
lost (e.g. a dropped WebSocket) but the booking still committed?

---

## Security

**36. Where exactly could a password hash leak, and how is that
prevented?**
*Short:* Nowhere — every route hand-builds its response object rather
than spreading a raw Prisma user row.
*Deeper:* Prisma's generated `User` type includes `passwordHash` by
construction (it's a real column); the discipline is entirely in never
doing `res.json({ user })` with a raw Prisma result, always
`res.json({ user: { id, name, email, role } })` explicitly.
*Follow-up:* How would you prevent this class of bug more structurally,
instead of relying on route-by-route discipline?

**37. Why httpOnly cookies for the JWT instead of localStorage?**
*Short:* httpOnly cookies aren't readable by JavaScript, which blocks the
most common XSS-driven token theft pattern.
*Deeper:* The trade-off is CSRF exposure instead — mitigated here by
`sameSite: "lax"`, which blocks cross-site requests from actually
attaching the cookie in the cases that matter (state-changing cross-
origin POSTs from a third-party page).
*Follow-up:* What would need to change if the frontend and API were on
completely different top-level domains (not just different ports)?

**38. Why does `POST /api/bookings/find` return the same 404 for "wrong
reference" and "wrong email"?**
*Short:* To avoid the endpoint becoming an oracle for enumerating valid
booking references or confirming an email's association with a booking.
*Deeper:* If a wrong email on a valid reference returned a distinguishable
error ("reference exists but email doesn't match"), an attacker could
binary-search toward valid reference codes, or confirm a guess about
who booked a specific show.
*Follow-up:* What other endpoints in this app have a similar
information-disclosure risk, if any?

**39. How is rating eligibility enforced, and why not just hide the UI
for ineligible users?**
*Short:* Server-side check in the ratings route (`CONFIRMED` booking +
ended show), independent of whatever the client shows.
*Deeper:* Hiding a button is a UX nicety, not a security boundary — anyone
can `curl` the endpoint directly, so the actual guarantee has to live in
`ratings.routes.ts`, which it does.
*Follow-up:* Is there a race here too — e.g. rating right as a show's
`endTime` passes? Does it matter?

**40. How is booking ownership enforced for cancellation?**
*Short:* `cancelBooking` checks `booking.userId !== ctx.userId` (from the
JWT) and throws 403 if they don't match, before touching anything else.
*Deeper:* The booking ID is caller-supplied (from the URL), so it's
exactly the kind of input that must never be trusted to imply
authorization — ownership is always re-derived from the authenticated
session, never assumed from the request.
*Follow-up:* Can a guest booking ever be cancelled in this design? Why or
why not, and is that a gap?

---

## Monorepo / tooling

**41. What does `packages/shared` actually contain, and why does nothing
in it have a build step during development?**
*Short:* TypeScript types, Zod schemas, and constants; no dev build step
because Vite and `tsx` both transform its TS source directly through the
workspace symlink.
*Deeper:* See INTERVIEW_NOTES.md §8 — `turbo build`'s production path
does compile it (`dependsOn: ["^build"]`), but nothing about local `dev`
depends on that.
*Follow-up:* What would break if `packages/shared` needed native/compiled
dependencies (not just TypeScript)?

**42. Why can each app run standalone as well as all together via
`turbo dev`?**
*Short:** So you can demo or debug one piece (e.g. just the API via curl)
without needing the other two apps running.
*Deeper:* This also just falls out naturally from npm workspaces — each
`apps/*` package has its own `package.json` with its own `dev` script;
`turbo dev` is a convenience that runs all of them in parallel, not a
requirement.
*Follow-up:* How would you add a `docker-compose` setup on top of this
without changing the apps themselves?

**43. What's the difference between `turbo.json`'s `dependsOn: ["^build"]`
and `dependsOn: ["build"]`?**
*Short:* `"^build"` means "this package's dependencies' build tasks";
plain `"build"` (no `^`) would mean "this same package's own other tasks."
*Deeper:* For this repo, an app's `build` should wait on
`packages/shared`'s `build` (a dependency), which is exactly what `^`
expresses.
*Follow-up:* Would `packages/shared` ever need its own `dependsOn`?

---

## Performance

**44. Where's the one place in this codebase most likely to become a
bottleneck at real scale, and why?**
*Short:* The seat map endpoint's Redis lookups, if a screen had hundreds
of seats and shows were viewed extremely concurrently.
*Deeper:* Already pipelined (see Q29) rather than sequential, which is the
main lever available without changing the data model; a further
optimization would be caching the whole seat-status summary with a short
TTL and invalidating it on write, rather than recomputing from Redis+
Postgres on every seat-map request.
*Follow-up:* How would you measure whether this is actually a bottleneck
before optimizing it?

**45. Why does the ratings aggregate (average + count) run per-movie
instead of once for the whole list?**
*Short:* It currently does run once per movie in a list response (a
`Promise.all` over the list) — a legitimate question is whether that's
N+1-shaped.
*Deeper:* It technically is N queries for N movies, but each is a fast
indexed aggregate on a small table at this project's scale; the
documented trade-off (see README) is explicitly "this is fine at this
scale, here's what changes if it isn't."
*Follow-up:* How would you rewrite this as a single query instead of N?

**46. Why is there no caching layer in front of `GET /api/movies`?**
*Short:* Traffic at this project's scale doesn't need it; Redis is
already available and mentioned as a caching layer for "hot read paths"
in general (e.g. a show's seat-availability summary) but wasn't applied
to the movie list specifically since it changes rarely and cheaply
re-queries.
*Deeper:* Worth being honest that "we have Redis" doesn't mean "cache
everything" — caching has an invalidation cost that has to be worth
paying per endpoint.
*Follow-up:* Which specific endpoint in this app would benefit most from
a cache-aside pattern, and what would the cache key/invalidation trigger
be?

---

## Third-party integration & scope decisions (external movie data, location, QR, email)

**51. Why does importing a movie create a local database row instead of
the app just calling the external movie API directly whenever it needs
movie data?**
*Short:* Because `Booking`/`BookingSeat`/`Rating` all have foreign keys
into `Movie.id` — the catalog has to be something this system owns, not a
live pass-through to a third party that can rename, remove, or rate-limit
a title out from under an existing booking's history.
*Deeper:* The external source (currently OMDb) is treated as a one-time
data ENTRY convenience for the admin (`POST /api/admin/external-movies/import`
upserts a local row keyed on `Movie.externalId`), not a live dependency of
any customer-facing read path — `GET /api/movies` never talks to OMDb,
only Postgres.
*Follow-up:* What would break, concretely, if `GET /api/movies` proxied
an external API live instead of reading a local table?

**52. What happens if `OMDB_API_KEY` isn't configured?**
*Short:* The import endpoints return a clear 500 with an actionable
message; nothing else in the app is affected.
*Deeper:* This is a deliberate "optional enrichment, not a hard
dependency" design — `env.ts` doesn't throw at boot if the key is
missing (unlike `DATABASE_URL`, which does), because the whole rest of
the app — browsing, booking, ratings — has nothing to do with the
external movie source. The same pattern is used again for
`RESEND_API_KEY` (email logs to console instead of sending).
*Follow-up:* How would you test this integration in CI, given it depends
on a real third-party API and key?

**52b. This project actually switched from TMDB to OMDb after TMDB access
turned out unreliable. What made that swap cheap?**
*Short:* Every touchpoint was named after the *role* it plays
(`externalMovieService.ts`, `/api/admin/external-movies`,
`Movie.externalId`) rather than the vendor implementing it, so the swap
was a two-file change (the service implementation + the admin UI's
labels), not a search-and-replace across the app.
*Deeper:* OMDb also has real behavioral differences worth knowing —
it always returns HTTP 200 even for errors (failures only show up in the
JSON body's `Response`/`Error` fields), and its search endpoint returns
no synopsis at all (only the per-title details call does) — both handled
explicitly in `externalMovieService.ts` rather than assumed away.
*Follow-up:* What would NOT have been protected by this naming choice —
i.e., what's a change a provider swap could still force even with a
generic name?

**53. Why is "movies near me" a manual city dropdown instead of real
browser geolocation?**
*Short:* At this project's scale (a handful of seeded theatres, all one
city), real geolocation would add a permissions-prompt UX flow and a
distance calculation without demonstrating anything the booking design
actually cares about — a city filter answers the same question with a
fraction of the complexity.
*Deeper:* Real geolocation also needs real geocoded theatre coordinates
to be meaningfully different from a short list an admin already
maintains (`Theatre.city`) — worth being explicit that this is a scoping
call made on purpose, not a missing feature.
*Follow-up:* What would change in the schema/API if you DID want real
distance-based sorting later?

**54. Walk me through how the city filter actually queries the database.**
*Short:* `GET /api/movies?city=X` adds a Prisma `where` clause:
`{ shows: { some: { screen: { theatre: { city: X } } } } }`.
*Deeper:* This is a relation filter through three joins (`Movie` →
`Show` → `Screen` → `Theatre`) expressed declaratively — Prisma compiles
it to a single query with the appropriate joins/EXISTS subquery, rather
than the route handler manually joining tables.
*Follow-up:* Would this filter perform well if there were millions of
shows? What index would you check for first?

**55. Why does the QR code encode plain ticket text instead of, say, a
JSON blob or a database lookup URL?**
*Short:* Plain text is legible on its own (a phone's default camera app
shows the ticket details directly with no app needed) and needs no
backend endpoint at all — it's built entirely from fields already on
`BookingDTO` client-side.
*Deeper:* A verification URL (`/verify/:reference`) would be the right
choice for a flow where theatre staff *scan and check the database* —
genuinely more secure/useful for that specific job, but it's a different
feature (needs a staff-facing verification screen) that this project
doesn't otherwise need, so it's named as a "what's next" rather than
half-built.
*Follow-up:* What's a security concern with putting raw booking details
(not just a reference code) into a scannable QR code?

**55b. Why doesn't email verification block login, booking, or rating?**
*Short:* To keep a new, independent feature from reaching into the
booking transaction's already-carefully-scoped logic just to add an
unrelated business rule — see INTERVIEW_NOTES.md §2 (email OTP section).
*Deeper:* It's a real, named scope boundary (documented in
`schema.prisma`'s comment on `User.emailVerified`), not an oversight —
the natural next increment (gating ratings on verification, since rating
already requires an account) is called out explicitly as unbuilt.
*Follow-up:* If you added that gate, where exactly would the check go,
and would it need a new error code?

**55c. Why does the OTP live in Redis instead of a database column with
an expiry timestamp?**
*Short:* `SET emailverify:{userId} {otp} EX 600` is the same
self-expiring-key pattern as seat holds — a value that's only ever
relevant for a short, fixed window is exactly what Redis's `EX` is for,
with no cleanup job needed once it's used or expires.
*Deeper:* A Postgres column would work too, but would need an explicit
expiry check on every read (`WHERE expiresAt > now()`) and a periodic job
to clean up stale rows — Redis gets both "for free" from the same
mechanism already in use elsewhere in this codebase for a structurally
identical problem.
*Follow-up:* Why is a Lua script NOT needed here the way it was for
releasing a seat hold (`seatHoldService.ts`'s `releaseScript`)?

**55d. Why is sending the booking ticket email "fire-and-forget" —
what would go wrong if it were `await`ed into the response?**
*Short:* The booking has already durably committed in Postgres by the
time the email is even attempted — a slow or failing email provider must
never be able to delay the HTTP response for a booking that has, in
fact, already succeeded.
*Deeper:* `await`ing it would make the user-perceived latency of
"Confirm & Pay" depend on a third party (Resend) that has nothing to do
with whether the booking itself succeeded — and if that `await` were
inside a try/catch that turned a slow/failed send into an error response,
it would be actively WRONG: the client would see "booking failed" for a
booking that is, in the database, definitely confirmed.
*Follow-up:* How would you notice, in production, if ticket emails
silently stopped sending for everyone (since nothing surfaces to the
user or fails the request)?

**55e. Why are "Search Movies" and "Now Showing" separate pages instead
of one movie list with a filter toggle?**
*Short:* They answer genuinely different questions from different data
sources — "what's bookable in ShowTime's own catalog" (`bookable=true`)
vs. "what does a real movie database know about any title" (the public
`/discover` endpoints, which never touch the local `Movie` table at all)
— and collapsing them back into one view would reintroduce the exact bug
(a browsable, unbookable result presented as if it were purchasable) that
prompted the split.
*Deeper:* `GET /api/movies/discover/:externalId` still checks whether the
title happens to also be a local, bookable `Movie` (`localMovieId`/
`bookable` in the response) — so the two views aren't fully disconnected,
a Search Movies result CAN link into a real booking flow when one
exists; they're just never rendered as if that path always exists.
*Follow-up:* What would you need to add if you wanted Search Movies
results to be sortable by "closest to being bookable" (e.g. has a show
scheduled for next week vs. none at all)?

**55f. Why is the city Autocomplete's option list (~4,267 real cities)
different from the list that actually filters movies (~10 cities)?**
*Short:* Because they answer different questions — "what cities exist"
(a free, real, keyless geo API can answer this) vs. "what cities does
ShowTime have theatres in" (no free API can answer this — see the next
question) — and conflating them would either make the picker feel fake
(only ~10 options) or make picking a real city silently do nothing
useful (if all 4,267 "worked" but only 10 actually have movies).
*Deeper:* Picking an unserviced city is handled explicitly, not hidden —
`GET /api/movies?bookable=true&city=X` legitimately returns zero results
for most of those 4,267 cities, and the UI shows a plain "not available
here yet" message with the real serviceable cities offered as quick
picks, rather than a bare empty state or a fabricated "nearest theatre"
calculation.
*Follow-up:* How would `reverse-geocode`'s result differ from a value a
user typed into the Autocomplete, in terms of how much you'd trust it?

**55g. Why does reverse-geocoding happen server-side instead of the
browser calling Nominatim directly?**
*Short:* Nominatim's usage policy requires a real `User-Agent` header
identifying the calling application, and centralizing that (plus the
API's rate limit) in one server-side service is simpler than trying to
set a custom header from `fetch` in a browser (which has restrictions on
which headers JS can set) and avoids a CORS negotiation entirely.
*Deeper:* This is the same "proxy a third-party API from the server, not
the client" pattern used everywhere else external data enters this app
(OMDb, the India-cities API) — keeping API keys/compliance requirements
server-side is a good default even when (as here) the specific API is
keyless.
*Follow-up:* What would change about this if the app needed to support
many geolocation requests per second across many users?

**55h. Where is the 10-seats-per-booking limit actually enforced, and
why does it exist in two places?**
*Short:* `confirmBookingSchema`'s `.max(MAX_SEATS_PER_BOOKING)` in
`packages/shared` is the real guarantee (a request for 11 seats is
rejected with a 400 regardless of what the client does); `SeatMapGrid.tsx`
mirrors it by refusing to let a user select an 11th seat in the UI.
*Deeper:* Same pattern as validating on both the server (the guarantee)
and the client (the UX) everywhere else in this app — the client-side
check alone proves nothing about correctness, but it's the difference
between finding out about the limit at seat #11 versus after filling in
guest details and hitting a confusing rejection at the confirm step.
*Follow-up:* Is 10 the right number? What would you look at to decide
whether it should be higher or lower?

**55i. This project first said "no free API exists for theatre data,"
then later added a real theatre-location importer. What was actually
true both times?**
*Short:* Both statements were true about DIFFERENT halves of the same
problem — a theatre's existence/location IS free and public
(OpenStreetMap), but its schedule (which movie, when, what price) never
has been and structurally can't be, since that's the actual proprietary
product BookMyShow and cinema chains sell.
*Deeper:* The correction came from actually testing a specific
hypothesis (does OSM tag real cinemas?) rather than assuming the
original blanket claim was complete — worth being able to say plainly
that the first answer was incomplete, not defend it as if it had been
exactly right.
*Follow-up:* What made OpenStreetMap have this data when a proprietary
booking platform's schedule never will?

**55j. Why geocode via Nominatim first and query Overpass with a
bounding box, instead of asking Overpass for `area[name="Bangalore"]`
directly?**
*Short:* OSM's area names don't reliably match a plain city name string
— e.g. Bangalore is tagged "Bengaluru" in OSM — so an exact-name match
silently returns zero results for real cities with a naming mismatch,
while a lat/lng bounding box from a geocoder is unambiguous regardless
of what OSM happens to call the place.
*Deeper:* This was found by testing, not guessed — the area-name
approach genuinely returned nothing for Mumbai and Bangalore in a real
test, which is what prompted switching to the bounding-box approach.
*Follow-up:* What's a downside of the bounding-box approach (hint: city
administrative boundaries aren't rectangles)?

**55k. Why does "Auto-schedule Shows" take a list of movie IDs from the
admin rather than picking movies itself?**
*Short:* Because there's no principled way for the server to know which
movies an admin actually wants showing — "auto" here means "automate the
tedious distribution across many screens," not "automate the business
decision of what to program."
*Deeper:* This keeps the feature honestly scoped as fast data-entry
tooling (distributing a human decision efficiently) rather than
implying it's making scheduling decisions on its own — an important
distinction given the whole point of this feature was to NOT
overclaim what's actually automated versus what's still curated.
*Follow-up:* What would a smarter (but still honest) version of this
tool look like — e.g. weighting by genre popularity or movie rating?

**56. This project added three features after initial feedback that the
first pass felt too "basic." What does that reveal about how the initial
scope was chosen?**
*Short:* The original cut list (README's "What was deliberately cut")
was reasoned from the concurrency-design goal outward, but a portfolio
project also has to *read* as complete to someone skimming it — real data
and a physical-feeling artifact (the ticket) matter for that first
impression even when they don't add engineering depth.
*Deeper:* Good scoping isn't just "what's technically necessary" — it's
also "what does a reviewer need to see to trust the depth is real."
Being able to say this plainly, rather than defending the original scope
as obviously correct, is itself the answer worth giving.
*Follow-up:* Is there a risk that these additions dilute the project's
signature story (the race-condition handling)? How would you keep that
from happening?

---

## Forgot password

**56b. Why does forgot-password reuse the same OTP mechanism as email
verification instead of a token-in-a-link flow (the more common pattern
for password reset)?**
*Short:* This app already has a working Redis-backed 6-digit-code
mechanism with the right properties (short-lived, self-expiring, emailed)
for email verification — reusing it for password reset avoids building a
second system that does the same job differently, and a namespaced
`purpose` on the key is all that was needed to keep the two independent.
*Deeper:* A link-based flow (a long random token in a URL) is also
valid and arguably more standard for password reset specifically — the
trade-off here was consistency and reuse within this codebase over
matching the most common industry pattern exactly.
*Follow-up:* What's a real security trade-off between a 6-digit code and
a long random token in a link?

**56c. Why does `resetPassword()` verify the code and set the new
password in one call instead of two separate steps?**
*Short:* Splitting them would leave a window where a successfully-
verified code is a de facto standing credential — anyone who obtained it
could set the password later, not just in the same request. Collapsing
them means the code is consumed (deleted from Redis) in the same
operation that uses it.
*Deeper:* This is the same principle as the seat-hold-then-book flow not
having a separate "confirm the hold is valid" step you could call ahead
of time and cash in later — verification and the action it authorizes
happen together, atomically, whenever a check like this exists.
*Follow-up:* Does the same "verify and act together" principle apply
anywhere else in this codebase you can think of?

## Payment (Stripe test mode)

**57. Why does adding real Stripe payment not change anything about the
booking transaction's structure?**
*Short:* Because payment verification was always a gate BEFORE the
transaction starts, never a step inside it — swapping "check a boolean
flag" for "re-fetch a PaymentIntent from Stripe and verify it" is a
private detail of that one gate, not a structural change to
`confirmBooking()`.
*Deeper:* This is deliberate evidence the original design wasn't
over-fit to the mocked-payment version of the problem — the same
two-layer Redis/Postgres concurrency guarantee holds regardless of which
payment path is active.
*Follow-up:* What WOULD have to change structurally if payment needed to
become asynchronous (e.g. supporting a redirect-based payment method)?

**58. Why does the server re-fetch the PaymentIntent from Stripe instead
of trusting the client's `paymentIntentId` at face value?**
*Short:* A client could send any string, including a fabricated one or
someone else's real (but unrelated) successful PaymentIntent id — the
server has to independently verify with Stripe that THIS id really
succeeded, for THIS amount, for THIS cart.
*Deeper:* Three checks specifically: status is `succeeded`, the amount
matches this cart's server-computed total (never the client's claimed
total), and the PaymentIntent's metadata (showId + a sorted seat-id key)
matches this exact attempt — the last one is what stops a successful
payment for cart A being replayed to book cart B.
*Follow-up:* Why is the seat-id key SORTED before being stored in/
compared against metadata?

**59. Why is `Booking.paymentIntentId` a unique column, and what
specific bug would exist without it?**
*Short:* Without it, the same successfully-verified PaymentIntent could
be submitted to `/confirm` twice (a network retry, a double-click, or
deliberately) and create two separate bookings from one real payment.
*Deeper:* It's checked explicitly with a clear 409 BEFORE the insert
attempt, rather than only relying on the database's unique constraint to
reject the second attempt — the same principle as pre-checking Redis
holds before relying on the Postgres unique constraint for seats: a
specific, fast, well-labeled error beats a generic one.
*Follow-up:* Is this the same kind of problem as the seat double-booking
race, or a different one?

**60. Why does the checkout flow use `redirect: "if_required"` with
Stripe's `confirmPayment`?**
*Short:* Card payments without 3D Secure resolve synchronously in the
browser — `redirect: "if_required"` keeps the user on the same page for
that common case, only redirecting away (to a bank's authentication
page, say) when a payment method genuinely requires it.
*Deeper:* This is what lets the whole checkout stay a single-page,
single-request/response flow for the demo's test cards, without needing
to build a "return from redirect and resume checkout" flow that a fully
general Stripe integration would eventually need.
*Follow-up:* What test card would force the redirect path, and what
would need to change in this app to handle it?

## Deployment (Vercel + Render)

**61. Why does `apps/api` have to be a Render Web Service instead of
something serverless like Vercel functions?**
*Short:* Socket.io needs a persistent, long-lived connection per client —
a serverless invocation ends and the connection would drop with it, so
the real-time seat map fundamentally can't run on a platform that only
holds a process open for the duration of one request.
*Deeper:* This is the one hard constraint that forces a two-vendor setup
(Vercel for the two static frontends, Render for the API) instead of a
single-vendor Vercel deployment — worth naming as the reason, not just
the choice.
*Follow-up:* What would change about this app's architecture if you had
to run the API on a serverless platform anyway?

**62. Why did `packages/shared` need both a CommonJS AND an ESM build,
instead of picking one?**
*Short:* `apps/api`'s production start (`node dist/index.js`, no
bundler) needs `require()`-compatible CommonJS; Vite/Rollup's production
build (for `apps/web`/`apps/admin`) needs ESM to reliably see named
exports — a CJS-only build broke Rollup's static export analysis on a
`export * from "./constants"` re-export, discovered only when a real
`vite build` failed, not by typechecking or running the dev server.
*Deeper:* The `package.json` `exports` field's `require`/`import`
conditions let one package serve both builds without either consumer
knowing or caring which one it got — the standard pattern for a package
that has both a Node-run and a bundler-run consumer in the same monorepo.
*Follow-up:* Why didn't this break in the dev server, only in the
production Vite build?

**63. Why are auth cookies `SameSite=Lax` locally but `SameSite=None;
Secure` in production, and what would actually break if you deployed
with the local settings unchanged?**
*Short:* Vercel and Render are different domains — genuinely cross-site
— and `SameSite=Lax` cookies are only attached to top-level navigations,
never to the cross-origin `fetch`/XHR calls this SPA makes on every
request. Deployed with `Lax` unchanged, login would appear to succeed
(the response sets the cookie) but every subsequent request would
silently go out with no session cookie at all.
*Deeper:* `SameSite=None` requires `Secure` (HTTPS-only) as a browser
rule, which is free on both platforms but is exactly why this couldn't
just always be `None`/`Secure` — a local `http://localhost` dev server
can't satisfy `Secure`, so the setting has to switch on `NODE_ENV`, not
be a single hardcoded value.
*Follow-up:* Why does `clearCookie` on logout also need to pass the same
`sameSite`/`secure` options it was set with?

**64. Why doesn't the deploy pipeline run the database seed script
automatically?**
*Short:* A normal deploy re-runs the build/migrate steps on every push —
auto-seeding on every deploy would mean every deploy silently wipes/resets
production data, which is never what you want once real bookings exist.
*Deeper:* Migrations (schema changes) and seeding (demo data) are
different concerns with different safe frequencies — migrations should
run on every deploy, seeding should run exactly once (or deliberately, by
hand, when you actually want to reset the demo state).
*Follow-up:* How would this change if this were a real product with real
user data instead of a portfolio demo?

## Wildcard / synthesis

**47. If you had to explain this whole project in one diagram, what would
it be?**
*Short:* The architecture diagram in the README — three frontends, one
API, Postgres as source of truth, Redis for locks/pub-sub/cache.
*Follow-up:* Draw the sequence of a single seat booking from click to
confirmation, across every system involved.

**48. What's the most non-obvious bug this design prevents that a naive
implementation would have shipped?**
*Short:* Two users successfully booking the same seat under concurrent
load — the entire point of the two-layer design.
*Follow-up:* What's a bug this design does NOT prevent, that you'd still
need to handle separately?

**49. What would you do differently if you rebuilt this from scratch
today?**
*Short (candidate should have a real, specific answer, e.g.):* Add
idempotency keys to the confirm endpoint from day one, since the
concurrency story is incomplete without also handling client-side
retries, not just concurrent distinct clients.
*Follow-up:* Why didn't you build it that way the first time?

**50. What part of this project are you least confident about, and why?**
*Short (candidate should have a real answer — this is the "can you
self-assess honestly" question):* Likely candidates: the socket-disconnect
hold-release cut (§ "What was deliberately cut"), or the average-rating-
on-read choice at higher scale.
*Follow-up:* What would make you more confident about it — a test, a load
test, a code review, production data?

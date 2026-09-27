# Deploying ShowTime

## Live deployment

| | |
|---|---|
| Customer app | https://showtime-web-frontend-gamma.vercel.app |
| Admin panel | https://showtime-admin-gray.vercel.app (admin@showtime.dev / Admin123!) |
| API | https://showtime-tpip.onrender.com |

**Render free tier cold start**: the API spins down after ~15 minutes of
no traffic and takes roughly 30-60 seconds to wake back up on the next
request. If you're demoing this to someone, hit the API URL yourself a
minute beforehand so it's already warm — otherwise their first page
load will hang noticeably before anything appears, which reads as a bug
even though it's just free-tier infrastructure behavior.

---

**Target architecture:** `apps/web` and `apps/admin` on Vercel (static Vite
builds), `apps/api` on Render (a long-running Node web service — required
because Socket.io needs persistent connections, which rules out any
serverless/edge platform for this piece), with Render's managed Postgres
and Redis add-ons. No Docker anywhere — neither platform needs it; see
"Why no Docker" at the bottom.

Two real problems had to be fixed in the codebase before any of this
would actually work — both are already done, but they're worth
understanding since they're the kind of thing that only surfaces once you
try to deploy:

1. **`packages/shared` now has a real build step**, producing both a
   CommonJS build (`dist/cjs`, for `apps/api`'s plain-`node` production
   runtime, which can't `import`/transform TypeScript the way `tsx` does
   in dev) and an ESM build (`dist/esm`, for Vite/Rollup, which — proven
   the hard way — can't reliably statically analyze named exports from a
   TypeScript-compiled CommonJS bundle when it re-exports via `export *`).
   `package.json`'s `exports` field points each consumer at the right one.
   Nothing about local `npm run dev` changed — `packages/shared`'s own
   `dev` script runs `tsc --watch` for both targets, and editing shared
   code still hot-reloads dependent dev servers exactly as before.
2. **Auth cookies are now environment-aware** (`apps/api/src/config/cookieOptions.ts`).
   Locally, frontend and API share `localhost` (different ports, but
   same-site for cookie purposes) and cookies stay `SameSite=Lax`,
   `Secure=false`. In production, Vercel and Render are genuinely
   different domains — a cross-site relationship — and `SameSite=Lax`
   cookies are **not sent on cross-origin fetch/XHR calls** (only on
   top-level navigations), which would make login silently not persist.
   Production therefore uses `SameSite=None; Secure` (requires HTTPS,
   which both platforms provide for free), switched automatically by
   `NODE_ENV`.

---

## 1. Render — the API

Create a **Web Service** (not a Static Site, not a background worker —
this needs to stay running and accept WebSocket upgrades) pointing at
this repo.

- **Root Directory**: leave blank (repo root) — `npm install` needs to
  run at the workspace root so npm can create the symlinks that let
  `apps/api` resolve `@showtime/shared`.
- **Runtime**: Node. Set the Node version explicitly (an environment
  variable `NODE_VERSION=20` or similar LTS) rather than relying on
  whatever Render defaults to — this project was built against very
  recent Node locally; 20 LTS is a safer target for a hosted service.
- **Build Command**:
  ```
  npm install --include=dev && npm run build --workspace=packages/shared && npx prisma generate --schema=apps/api/prisma/schema.prisma && npm run build --workspace=apps/api && npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma
  ```
  Two things bundled into this one command, each caught live deploying
  this exact project:
  - `--include=dev` on the `npm install`: `NODE_ENV=production` is also
    set as a runtime env var below (needed for cookie behavior — see the
    top of this file), and npm treats that same env var as an
    install-time signal to skip `devDependencies` — which is exactly
    where every `@types/*` package this TypeScript build needs actually
    lives. Without this flag, `tsc` still runs (found on `PATH`) but
    fails with a wall of "Could not find a declaration file for module
    'express'"-style errors, since the type packages themselves were
    never installed.
  - The trailing `npx prisma migrate deploy`: Render's **free** tier has
    no Shell tab at all (a Starter-plan-and-up feature), so there's no
    later one-off command to run this manually — it has to be part of
    the pipeline itself. Safe to leave in permanently: `migrate deploy`
    only applies pending migrations and is a no-op if the schema's
    already current, so it doesn't hurt anything on a normal redeploy
    that doesn't need a new migration. (If you're on a paid plan with a
    Pre-Deploy Command field, that's the more "correct" place for this —
    it runs after a successful build but before the new version
    receives traffic — but it isn't available on free.)
- **Start Command**:
  ```
  node apps/api/dist/index.js
  ```
- **Health Check Path**: `/health`

### Render add-ons
Create a **Postgres** database and a **Redis** (or "Key Value") instance
in the same Render project. Render gives you connection strings for both
— use them directly as `DATABASE_URL` and `REDIS_URL` below.

### Environment variables (Render → your web service → Environment)

| Key | Value |
|---|---|
| `DATABASE_URL` | from Render's Postgres instance |
| `REDIS_URL` | from Render's Redis/Key-Value instance |
| `JWT_SECRET` | generate a real random secret (e.g. `openssl rand -hex 32`) — **not** the `dev-only-secret` from local `.env` |
| `JWT_EXPIRES_IN` | `15m` — this is the ACCESS token's lifetime only; staying logged in longer is handled by a separate, non-configurable refresh token (see INTERVIEW_NOTES.md) |
| `NODE_ENV` | `production` — this is what switches cookies to `SameSite=None; Secure` |
| `WEB_ORIGIN` | your deployed `apps/web` Vercel URL, e.g. `https://showtime-web.vercel.app` (no trailing slash) |
| `ADMIN_ORIGIN` | your deployed `apps/admin` Vercel URL |
| `OMDB_API_KEY` | same key you're already using locally |
| `RESEND_API_KEY` | same key you're already using locally |
| `EMAIL_FROM` | same as local, or your verified Resend domain's address once you have one |
| `STRIPE_SECRET_KEY` | same **test-mode** key you're already using locally — do not switch to a live key for a portfolio demo |
| `GROQ_API_KEY` | same key you're already using locally — optional; powers the three GenAI features (review summarizer, mood search, booking assistant). Without it those endpoints degrade to a clean "not configured" response rather than the app failing to boot |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | same keys you're already using locally — optional; power the "you left mid-booking" Web Push notification. Generate a real pair once with `npx web-push generate-vapid-keys` (from `apps/api`) if you haven't already — they're a fixed identity for this deployment, not per-request secrets. Without them, the frontend's "enable notifications" prompt simply never appears |
| `VAPID_SUBJECT` | a `mailto:` address or `https://` URL — defaults to `mailto:noreply@showtime.dev` if unset, doesn't need to be monitored |
| `PORT` | Render sets this automatically; the app already reads `process.env.PORT`, don't override it |

### First deploy — and keeping it fresh — seed the production database from your own machine
The build/deploy pipeline above only migrates the schema — it deliberately
does **not** run the seed script automatically (you don't want a normal
deploy to silently wipe/reset production data).

Render's **free** tier has no Shell tab at all (that's a paid-plan
feature), so there's no one-off command to run *on* the service. Instead,
run the seed script from your own machine, pointed at the production
database via its **External Database URL** (Render's Postgres resource
page → distinct from the *Internal* URL used in the API's own
`DATABASE_URL` env var, which only resolves from inside Render's private
network):
```
DATABASE_URL="<external-database-url>" npm run db:seed --workspace=apps/api
```
(Run this from the repo root, on your own machine, with your local
`node_modules` already installed — it's the exact same seed script local
dev uses, just pointed at a different database via the inline env var,
which takes precedence over whatever `apps/api/.env` has.)

This single command **fully resets** the database — it wipes every
table (users, bookings, ratings, everything) and recreates the whole
demo catalog: movies, theatres, shows, the admin/demo accounts, coupons,
food items, events. Safe and expected the first time; just be aware
that re-running it later also wipes anyone who's registered an account
or made a real booking against the live demo since — there's no
"add more without touching what's there" mode, by design (see
`prisma/seed.ts`'s `deleteMany` calls at the top).

**Keeping the demo fresh over time**: the seed script's shows are
scheduled relative to "now" at seed time. If this deployment sits for a
few weeks without anyone re-running the seed, the "Now Showing" list
will gradually empty out as those shows' start times slide into the
past — that's expected, not a bug. The fix is the exact same command
above, re-run occasionally (or right before you plan to demo it to
someone) — there's no automated schedule for this (Render's free tier
has no cron/background-job feature either), so it's a manual step to
remember.

---

## 2. Vercel — the two frontends

Create **two separate Vercel projects** pointing at the same repo (one
for `apps/web`, one for `apps/admin`) — do not try to serve both from one
project.

For **each** project:
- **Root Directory**: repo root (leave as the default — do NOT set it to
  `apps/web`/`apps/admin`; the build command below needs to run from the
  root so `npm install` sets up the workspace symlinks first).
- **Framework Preset**: Vite (Vercel should auto-detect this once it sees
  the build output).
- **Install Command**: `npm install` (default — leave as-is).
- **Build Command** — override with the Turborepo filter for just that
  app (this builds `packages/shared` first automatically, since
  `turbo.json`'s `build` task already declares `dependsOn: ["^build"]`):
  - `apps/web` project: `npx turbo run build --filter=@showtime/web`
  - `apps/admin` project: `npx turbo run build --filter=@showtime/admin`
- **Output Directory** — override with the path to that app's build
  output:
  - `apps/web` project: `apps/web/dist`
  - `apps/admin` project: `apps/admin/dist`

### Environment variables

**`apps/web` Vercel project:**

| Key | Value |
|---|---|
| `VITE_API_URL` | `https://<your-render-service>.onrender.com/api` |
| `VITE_SOCKET_URL` | `https://<your-render-service>.onrender.com` |
| `VITE_STRIPE_PUBLISHABLE_KEY` | same `pk_test_...` key you're already using locally |

**`apps/admin` Vercel project:**

| Key | Value |
|---|---|
| `VITE_API_URL` | `https://<your-render-service>.onrender.com/api/admin` |

Remember: Vite bakes `VITE_*` variables in **at build time**, not runtime
— if you change one, you need to trigger a new Vercel deployment, not
just restart anything.

### A note on Vercel preview deployments
Every PR/branch push gets its own preview URL on Vercel, which won't
match `WEB_ORIGIN`/`ADMIN_ORIGIN` on Render, so preview deployments will
fail CORS against the live API. That's expected and fine for a portfolio
project — only the production Vercel URL needs to be registered with
Render's CORS whitelist.

---

## Why no Docker

Neither platform needs it: Vercel builds static Vite output directly from
source, and Render's "Web Service" natively runs a Node build/start
command against your repo — no image to build, push, or maintain.
Docker would only earn its keep if targeting something that specifically
wants a container (Kubernetes, Fly.io, AWS ECS, etc.) or if you needed
byte-identical environment parity across many services — neither applies
to a 3-app monorepo going to two managed platforms that already handle
the runtime for you. Adding it here would be pure overhead with no real
benefit, the kind of complexity this project has deliberately avoided
throughout (see README's "What was deliberately cut").

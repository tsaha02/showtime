# Deploying ShowTime

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
  npm install && npm run build --workspace=packages/shared && npx prisma generate --schema=apps/api/prisma/schema.prisma && npm run build --workspace=apps/api
  ```
- **Pre-Deploy Command** (if your Render plan has this field — it runs
  after a successful build but before the new version receives traffic,
  which is exactly where a migration belongs; if unavailable, append it
  to the end of the Build Command instead):
  ```
  npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma
  ```
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
| `JWT_EXPIRES_IN` | `7d` |
| `NODE_ENV` | `production` — this is what switches cookies to `SameSite=None; Secure` |
| `WEB_ORIGIN` | your deployed `apps/web` Vercel URL, e.g. `https://showtime-web.vercel.app` (no trailing slash) |
| `ADMIN_ORIGIN` | your deployed `apps/admin` Vercel URL |
| `OMDB_API_KEY` | same key you're already using locally |
| `RESEND_API_KEY` | same key you're already using locally |
| `EMAIL_FROM` | same as local, or your verified Resend domain's address once you have one |
| `STRIPE_SECRET_KEY` | same **test-mode** key you're already using locally — do not switch to a live key for a portfolio demo |
| `PORT` | Render sets this automatically; the app already reads `process.env.PORT`, don't override it |

### First deploy — seed the production database once, manually
The build/deploy pipeline above only migrates the schema — it deliberately
does **not** run the seed script automatically (you don't want a normal
deploy to silently wipe/reset production data). After the first
successful deploy, open a one-off shell against the service (Render's
dashboard has a "Shell" tab for this) and run:
```
npm run db:seed --workspace=apps/api
```
Then, to get a real movie catalog and some bookable shows (as done
throughout local development), hit the admin bulk-import/auto-schedule
endpoints once against the live URL, or just do it through the deployed
admin panel once it's up (Movies → Populate Popular Movies, Shows →
Auto-schedule Shows).

**Keeping the demo fresh over time**: the seed script's shows are
scheduled relative to "now" at seed time. If this deployment sits for a
few weeks without anyone re-running the seed/auto-schedule steps, the
"Now Showing" list will gradually empty out as those shows' start times
slide into the past — that's expected, not a bug, and the fix is the
same one-off shell command above, re-run occasionally (or right before
you plan to demo it to someone).

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

import { env } from "./env";

// In production the two frontends (deployed to Vercel) and this API
// (deployed to Render) live on different domains — a genuinely
// cross-site relationship from the browser's point of view, even though
// they're all "this app." `SameSite=Lax` cookies are only attached to
// top-level navigations, NOT to the cross-origin fetch/XHR calls this
// app's SPAs make on literally every request — so cross-domain auth
// requires `SameSite=None`, which browsers only honor alongside
// `Secure` (HTTPS-only; both Vercel and Render terminate HTTPS for you
// by default, so this is free in production).
//
// Locally, frontend and API are different ports of `localhost` — still
// technically cross-origin, but treated as same-site for SameSite-cookie
// purposes — and a plain `http://localhost` dev server can't satisfy
// `Secure`, so local dev keeps the original Lax/insecure combination.
const isProduction = env.nodeEnv === "production";

export function authCookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
    secure: isProduction,
    maxAge: maxAgeMs,
  };
}

import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@showtime/shared";
import { validateBody } from "../middleware/validate";
import { asyncHandler } from "../utils/asyncHandler";
import {
  registerUser,
  loginUser,
  verifyUserEmail,
  resendOtp,
  forgotPassword,
  resetPassword,
  toPublicUser,
} from "../services/authService";
import { rotateRefreshToken, revokeRefreshToken, refreshTtlFor } from "../services/refreshTokenService";
import { CUSTOMER_COOKIE, CUSTOMER_REFRESH_COOKIE, requireCustomerAuth } from "../middleware/auth";
import { authCookieOptions } from "../config/cookieOptions";
import { signAuthToken, ACCESS_TOKEN_TTL_MS } from "../utils/jwt";
import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/ApiError";

const router = Router();

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// Tighter limit than general auth endpoints: this one's whole job is
// "let someone retry a 6-digit guess," so it's the one most worth
// throttling hard against brute force (600s TTL × 10000 possible codes
// is still guessable fast without a limit like this).
const otpRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
});

// The access-token cookie's lifetime always matches the JWT it holds
// (ACCESS_TOKEN_TTL_MS is derived from the exact same JWT_EXPIRES_IN
// string jsonwebtoken signs with) — see jwt.ts's comment on why that
// used to drift. The refresh-token cookie is scoped to `/api/auth` via
// its own `path` so it isn't sent on every request, only the
// refresh/logout calls that actually need it.
const ACCESS_COOKIE_OPTS = authCookieOptions(ACCESS_TOKEN_TTL_MS);
const REFRESH_COOKIE_OPTS = authCookieOptions(refreshTtlFor("CUSTOMER"), "/api/auth");

function setSessionCookies(res: import("express").Response, accessToken: string, refreshToken: string) {
  res.cookie(CUSTOMER_COOKIE, accessToken, ACCESS_COOKIE_OPTS);
  res.cookie(CUSTOMER_REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTS);
}

function clearSessionCookies(res: import("express").Response) {
  // clearCookie must be called with the same path/sameSite/secure
  // attributes the cookie was originally set with — some browsers
  // (Chrome included) won't overwrite/delete a SameSite=None;Secure (or
  // path-scoped) cookie with a clearing call that omits those
  // attributes, so logout would silently fail to actually clear the
  // session in production.
  res.clearCookie(CUSTOMER_COOKIE, ACCESS_COOKIE_OPTS);
  res.clearCookie(CUSTOMER_REFRESH_COOKIE, REFRESH_COOKIE_OPTS);
}

router.post(
  "/register",
  authRateLimit,
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { accessToken, refreshToken, user } = await registerUser(req.body);
    setSessionCookies(res, accessToken, refreshToken);
    res.status(201).json({ user });
  }),
);

router.post(
  "/login",
  authRateLimit,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { accessToken, refreshToken, user } = await loginUser(req.body);
    setSessionCookies(res, accessToken, refreshToken);
    res.json({ user });
  }),
);

// Access tokens are deliberately short-lived (see jwt.ts) — this is what
// silently renews one without forcing a fresh login, as long as the
// long-lived refresh token is still valid. Rotation is single-use (see
// refreshTokenService.ts's `rotateRefreshToken`): the presented refresh
// token is revoked the moment it's exchanged, and the response carries a
// brand-new one, which is why both cookies are re-set here, not just the
// access one.
router.post(
  "/refresh",
  authRateLimit,
  asyncHandler(async (req, res) => {
    const presented = req.cookies?.[CUSTOMER_REFRESH_COOKIE];
    if (!presented) throw ApiError.unauthorized();

    const rotated = await rotateRefreshToken(presented, "CUSTOMER");
    if (!rotated) {
      clearSessionCookies(res);
      throw ApiError.unauthorized();
    }

    const accessToken = signAuthToken({ sub: rotated.user.id, role: rotated.user.role });
    setSessionCookies(res, accessToken, rotated.refreshToken);
    res.json({ user: toPublicUser(rotated.user) });
  }),
);

router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const presented = req.cookies?.[CUSTOMER_REFRESH_COOKIE];
    // Best-effort: revoking is what stops a stolen-but-unused refresh
    // token from being replayed after the legitimate user signs out —
    // but a missing/already-invalid cookie shouldn't block logout from
    // the client's point of view either way.
    if (presented) await revokeRefreshToken(presented);
    clearSessionCookies(res);
    res.status(204).send();
  }),
);

// Not behind requireCustomerAuth: verifying is part of finishing
// registration, and a user's session cookie is already set by the time
// they'd use this (see registerUser), but requiring it would only add
// friction with no real security benefit — the OTP itself is the proof
// of access to the email, not the session cookie.
router.post(
  "/verify-email",
  otpRateLimit,
  validateBody(verifyEmailSchema),
  asyncHandler(async (req, res) => {
    await verifyUserEmail(req.body);
    res.status(204).send();
  }),
);

router.post(
  "/resend-otp",
  otpRateLimit,
  validateBody(resendOtpSchema),
  asyncHandler(async (req, res) => {
    await resendOtp(req.body);
    // Always 204, whether or not an account exists for this email or is
    // already verified — see resendOtp()'s comment on why this doesn't
    // reveal account state.
    res.status(204).send();
  }),
);

router.post(
  "/forgot-password",
  otpRateLimit,
  validateBody(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    await forgotPassword(req.body);
    // Always 204 — see forgotPassword()'s comment on why this can't
    // reveal whether an account exists for this email.
    res.status(204).send();
  }),
);

router.post(
  "/reset-password",
  otpRateLimit,
  validateBody(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const { accessToken, refreshToken, user } = await resetPassword(req.body);
    setSessionCookies(res, accessToken, refreshToken);
    res.json({ user });
  }),
);

router.get(
  "/me",
  requireCustomerAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw ApiError.notFound();
    res.json({ user: toPublicUser(user) });
  }),
);

export default router;

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
import { registerUser, loginUser, verifyUserEmail, resendOtp, forgotPassword, resetPassword } from "../services/authService";
import { CUSTOMER_COOKIE, requireCustomerAuth } from "../middleware/auth";
import { authCookieOptions } from "../config/cookieOptions";
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

const COOKIE_OPTS = authCookieOptions(7 * 24 * 60 * 60 * 1000);

router.post(
  "/register",
  authRateLimit,
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { token, user } = await registerUser(req.body);
    res.cookie(CUSTOMER_COOKIE, token, COOKIE_OPTS);
    res.status(201).json({ user });
  }),
);

router.post(
  "/login",
  authRateLimit,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { token, user } = await loginUser(req.body);
    res.cookie(CUSTOMER_COOKIE, token, COOKIE_OPTS);
    res.json({ user });
  }),
);

router.post("/logout", (_req, res) => {
  // clearCookie must be called with the same sameSite/secure attributes
  // the cookie was originally set with — some browsers (Chrome included)
  // won't overwrite/delete a SameSite=None;Secure cookie with a clearing
  // call that omits those attributes, so logout would silently fail to
  // actually clear the session in production.
  res.clearCookie(CUSTOMER_COOKIE, COOKIE_OPTS);
  res.status(204).send();
});

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
    const { token, user } = await resetPassword(req.body);
    res.cookie(CUSTOMER_COOKIE, token, COOKIE_OPTS);
    res.json({ user });
  }),
);

router.get(
  "/me",
  requireCustomerAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw ApiError.notFound();
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        walletBalance: user.walletBalance,
        referralCode: user.referralCode,
      },
    });
  }),
);

export default router;

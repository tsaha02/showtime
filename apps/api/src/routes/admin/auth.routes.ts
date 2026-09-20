import { Router } from "express";
import rateLimit from "express-rate-limit";
import { loginSchema } from "@showtime/shared";
import { validateBody } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { loginUser } from "../../services/authService";
import { ADMIN_COOKIE, requireAdminAuth } from "../../middleware/auth";
import { authCookieOptions } from "../../config/cookieOptions";
import { prisma } from "../../lib/prisma";

const router = Router();

const authRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 });

const COOKIE_OPTS = authCookieOptions(24 * 60 * 60 * 1000);

// No public registration endpoint for admins — the seed script creates
// the one admin account (see prisma/seed.ts). Admins share the same
// Users table + role column as customers; ADMIN role is what this login
// route requires.
router.post(
  "/login",
  authRateLimit,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { token, user } = await loginUser(req.body, "ADMIN");
    res.cookie(ADMIN_COOKIE, token, COOKIE_OPTS);
    res.json({ user });
  }),
);

router.post("/logout", (_req, res) => {
  // See the comment on this same pattern in ../auth.routes.ts — clearing
  // needs to match the original sameSite/secure attributes to reliably
  // work across browsers.
  res.clearCookie(ADMIN_COOKIE, COOKIE_OPTS);
  res.status(204).send();
});

router.get(
  "/me",
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    res.json({
      user: {
        id: user!.id,
        name: user!.name,
        email: user!.email,
        role: user!.role,
        emailVerified: user!.emailVerified,
        walletBalance: user!.walletBalance,
        referralCode: user!.referralCode,
      },
    });
  }),
);

export default router;

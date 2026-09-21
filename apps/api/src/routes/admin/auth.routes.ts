import { Router } from "express";
import rateLimit from "express-rate-limit";
import { loginSchema } from "@showtime/shared";
import { validateBody } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { loginUser, toPublicUser } from "../../services/authService";
import { rotateRefreshToken, revokeRefreshToken, refreshTtlFor } from "../../services/refreshTokenService";
import { ADMIN_COOKIE, ADMIN_REFRESH_COOKIE, requireAdminAuth } from "../../middleware/auth";
import { authCookieOptions } from "../../config/cookieOptions";
import { signAuthToken, ACCESS_TOKEN_TTL_MS } from "../../utils/jwt";
import { prisma } from "../../lib/prisma";
import { ApiError } from "../../utils/ApiError";

const router = Router();

const authRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 });

// See the identical comment in ../auth.routes.ts — the access cookie's
// maxAge is derived from the same string the JWT itself is signed with,
// and the refresh cookie is scoped to `/api/admin/auth` so it's only
// sent on the refresh/logout calls, not every admin request.
const ACCESS_COOKIE_OPTS = authCookieOptions(ACCESS_TOKEN_TTL_MS);
const REFRESH_COOKIE_OPTS = authCookieOptions(refreshTtlFor("ADMIN"), "/api/admin/auth");

function setSessionCookies(res: import("express").Response, accessToken: string, refreshToken: string) {
  res.cookie(ADMIN_COOKIE, accessToken, ACCESS_COOKIE_OPTS);
  res.cookie(ADMIN_REFRESH_COOKIE, refreshToken, REFRESH_COOKIE_OPTS);
}

function clearSessionCookies(res: import("express").Response) {
  res.clearCookie(ADMIN_COOKIE, ACCESS_COOKIE_OPTS);
  res.clearCookie(ADMIN_REFRESH_COOKIE, REFRESH_COOKIE_OPTS);
}

// No public registration endpoint for admins — the seed script creates
// the one admin account (see prisma/seed.ts). Admins share the same
// Users table + role column as customers; ADMIN role is what this login
// route requires.
router.post(
  "/login",
  authRateLimit,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { accessToken, refreshToken, user } = await loginUser(req.body, "ADMIN");
    setSessionCookies(res, accessToken, refreshToken);
    res.json({ user });
  }),
);

router.post(
  "/refresh",
  authRateLimit,
  asyncHandler(async (req, res) => {
    const presented = req.cookies?.[ADMIN_REFRESH_COOKIE];
    if (!presented) throw ApiError.unauthorized();

    const rotated = await rotateRefreshToken(presented, "ADMIN");
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
    const presented = req.cookies?.[ADMIN_REFRESH_COOKIE];
    if (presented) await revokeRefreshToken(presented);
    clearSessionCookies(res);
    res.status(204).send();
  }),
);

router.get(
  "/me",
  requireAdminAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw ApiError.notFound();
    res.json({ user: toPublicUser(user) });
  }),
);

export default router;

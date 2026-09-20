import type { Request, Response, NextFunction } from "express";
import { verifyAuthToken } from "../utils/jwt";
import { ApiError } from "../utils/ApiError";

// Customer app and admin app are separate frontends hitting the SAME API
// origin, so if they used one cookie name, logging into one would
// silently clobber the other's session cookie in the browser's cookie jar
// (cookies are scoped by the API's domain, not by which frontend sent the
// request). Two distinct cookie names keep the two auth contexts
// independent even though they share one Users table and one JWT scheme.
export const CUSTOMER_COOKIE = "st_customer_token";
export const ADMIN_COOKIE = "st_admin_token";

function attachUser(req: Request, cookieName: string) {
  const token = req.cookies?.[cookieName];
  if (!token) return;
  try {
    const payload = verifyAuthToken(token);
    req.user = { id: payload.sub, role: payload.role };
  } catch {
    // expired/invalid token — treat as logged out rather than erroring
  }
}

// Populates req.user if a valid customer cookie is present, but does not
// reject the request otherwise — used on routes that behave differently
// for guests vs logged-in users (e.g. confirm booking).
export function optionalCustomerAuth(req: Request, _res: Response, next: NextFunction) {
  attachUser(req, CUSTOMER_COOKIE);
  next();
}

export function requireCustomerAuth(req: Request, _res: Response, next: NextFunction) {
  attachUser(req, CUSTOMER_COOKIE);
  if (!req.user) return next(ApiError.unauthorized());
  next();
}

export function requireAdminAuth(req: Request, _res: Response, next: NextFunction) {
  attachUser(req, ADMIN_COOKIE);
  if (!req.user) return next(ApiError.unauthorized());
  if (req.user.role !== "ADMIN") return next(ApiError.forbidden("Admin access required"));
  next();
}

// Guest/session identifier for seat holds — a UUID the frontend generates
// once per browser tab (independent of login) so both guests and logged-in
// users can hold seats before/without authenticating.
export function requireSessionId(req: Request, _res: Response, next: NextFunction) {
  const sessionId = req.header("x-session-id");
  if (!sessionId) return next(ApiError.badRequest("Missing X-Session-Id header"));
  req.sessionId = sessionId;
  next();
}

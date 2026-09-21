import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { parseDurationMs } from "./duration";
import type { UserRole } from "@showtime/shared";

export interface AuthTokenPayload {
  sub: string; // user id
  role: UserRole;
}

// Short-lived by design (see JWT_EXPIRES_IN's default/comment in env.ts)
// — this is the ACCESS token now, not a single long-lived session token.
// A real session is the access/refresh PAIR issued together by
// authService.ts's `issueSession`; staying logged in for days works via
// refreshTokenService.ts rotating this token silently, not by making
// this one itself long-lived.
export function signAuthToken(payload: AuthTokenPayload): string {
  const options: jwt.SignOptions = { expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"] };
  return jwt.sign(payload, env.jwtSecret, options);
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
}

// The access-token cookie's `maxAge` is derived from this SAME string
// jsonwebtoken uses to sign the token, instead of a separately hand-typed
// number — this is precisely what let the access-token cookie and the
// JWT's own expiry drift out of sync in this codebase's history (the
// admin cookie was hardcoded to 24h while its JWT was actually signed for
// 7d, silently evicting the token 6 days before it would have expired on
// its own). One source of truth removes the class of bug, not just this
// one instance of it.
export const ACCESS_TOKEN_TTL_MS = parseDurationMs(env.jwtExpiresIn);

import crypto from "crypto";
import { prisma } from "../lib/prisma";
import type { UserRole } from "@showtime/shared";

// "Remember me" duration lives here, not on the access token (see
// utils/jwt.ts's ACCESS_TOKEN_TTL_MS) — a customer session outlives an
// admin one on purpose, matching this app's pre-existing 7d-customer/
// 24h-admin asymmetry (the admin cookie used to be hardcoded to 24h;
// that number is preserved here, just now actually enforced correctly).
const CUSTOMER_REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30d
const ADMIN_REFRESH_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export function refreshTtlFor(audience: UserRole): number {
  return audience === "ADMIN" ? ADMIN_REFRESH_TTL_MS : CUSTOMER_REFRESH_TTL_MS;
}

// Refresh tokens are opaque random strings, not JWTs — there's nothing
// to "decode," they're just a lookup key into this table, so a plain
// random value is simpler and doesn't need a signature. Only the hash is
// ever persisted; the raw value exists only in the response cookie and
// in the caller's hand for the length of one request.
function generateRawToken(): string {
  return crypto.randomBytes(48).toString("hex");
}

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function issueRefreshToken(userId: string, audience: UserRole): Promise<string> {
  const raw = generateRawToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      audience,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + refreshTtlFor(audience)),
    },
  });
  return raw;
}

interface RotateResult {
  user: { id: string; name: string; email: string; role: UserRole; emailVerified: boolean; walletBalance: number; referralCode: string };
  refreshToken: string;
}

// Single-use rotation: exchanging a refresh token for a new access/
// refresh pair immediately revokes the one that was presented, so it
// can never be exchanged a second time. If something DOES try to reuse
// an already-revoked token, that's a strong signal it was stolen (the
// legitimate client would have the NEW token by now, not the old one) —
// rather than just rejecting that one request, every other still-valid
// refresh token for this user+audience is revoked too, forcing every
// session using the stolen token (and the legitimate one) to log in
// again. A false positive here (e.g. a retried request racing its own
// rotation) costs an extra login; letting a real theft slide costs a
// session that can never be revoked.
export async function rotateRefreshToken(rawToken: string, audience: UserRole): Promise<RotateResult | null> {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!record || record.audience !== audience) return null;

  if (record.revoked) {
    await prisma.refreshToken.updateMany({
      where: { userId: record.userId, audience, revoked: false },
      data: { revoked: true },
    });
    return null;
  }
  if (record.expiresAt < new Date()) return null;

  const user = await prisma.user.findUnique({ where: { id: record.userId } });
  if (!user) return null;

  await prisma.refreshToken.update({ where: { id: record.id }, data: { revoked: true } });
  const refreshToken = await issueRefreshToken(user.id, audience);

  return {
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
      walletBalance: user.walletBalance,
      referralCode: user.referralCode,
    },
  };
}

// Called on logout — best-effort (a missing/already-invalid cookie is
// not an error, logout should always succeed from the client's point of
// view) so a stolen-then-discarded token can't be replayed after the
// legitimate user explicitly signed out.
export async function revokeRefreshToken(rawToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({ where: { tokenHash: hashToken(rawToken) }, data: { revoked: true } });
}

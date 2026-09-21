// A tiny parser for the handful of duration strings this app actually
// uses ("15m", "7d", ...) — just enough to turn the same string used as
// jsonwebtoken's `expiresIn` into a millisecond number for cookie
// `maxAge`. Not a general-purpose duration library: deliberately only
// supports single-unit strings, which is all `JWT_EXPIRES_IN` needs.
const UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

export function parseDurationMs(input: string): number {
  const match = /^(\d+)([smhd])$/.exec(input.trim());
  if (!match) throw new Error(`Unrecognized duration string: "${input}" (expected e.g. "15m", "7d")`);
  return Number(match[1]) * UNIT_MS[match[2]];
}

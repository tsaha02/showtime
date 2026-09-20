import { redis } from "../lib/redis";
import { SEAT_HOLD_TTL_SECONDS } from "@showtime/shared";

// --- Seat hold locks (Redis) ---
//
// A hold is a single Redis key `seat:{showId}:{seatId}` whose value is the
// requesting client's sessionId (a random UUID the frontend generates once
// per browser tab and persists in localStorage — independent of login, so
// guests can hold seats too) and whose TTL is the hold window. Redis is
// used here — instead of, say, an in-memory Map — specifically because it
// gives us for free: (1) atomic "acquire if nobody else has it" via
// `SET NX`, (2) automatic expiry via `EX` so an abandoned hold doesn't
// need a cleanup job, and (3) a shared lock store if the API ever runs as
// more than one process.
//
// This lock is the FAST, CHEAP first line of defense against two people
// selecting the same seat. It is deliberately NOT the source of truth for
// "is this seat booked" — see services/bookingService.ts for why the
// Postgres unique constraint is what actually prevents a double-booking.

export const holdKey = (showId: string, seatId: string) => `seat:${showId}:${seatId}`;

export type HoldResult =
  | { ok: true; expiresAt: Date }
  | { ok: false; reason: "held_by_other" };

export async function acquireHold(
  showId: string,
  seatId: string,
  sessionId: string,
): Promise<HoldResult> {
  const key = holdKey(showId, seatId);
  const set = await redis.set(key, sessionId, "EX", SEAT_HOLD_TTL_SECONDS, "NX");
  if (set === "OK") {
    return { ok: true, expiresAt: new Date(Date.now() + SEAT_HOLD_TTL_SECONDS * 1000) };
  }

  // Key already exists — either it's ours (re-selecting the same seat
  // extends the hold) or someone else's (reject).
  const owner = await redis.get(key);
  if (owner === sessionId) {
    await redis.expire(key, SEAT_HOLD_TTL_SECONDS);
    return { ok: true, expiresAt: new Date(Date.now() + SEAT_HOLD_TTL_SECONDS * 1000) };
  }
  return { ok: false, reason: "held_by_other" };
}

// Compare-and-delete as a single Lua script so "check owner, then delete"
// is atomic — without this, a hold could expire (or be re-acquired by
// someone else) in the gap between a plain GET and a plain DEL, and we'd
// delete a lock we no longer own.
const releaseScript = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

export async function releaseHold(showId: string, seatId: string, sessionId: string): Promise<boolean> {
  const result = await redis.eval(releaseScript, 1, holdKey(showId, seatId), sessionId);
  return result === 1;
}

// Used right before starting the booking transaction: confirms every seat
// in the cart is STILL held by this exact session. If a hold expired
// mid-checkout (TTL ran out, or someone else's browser force-released it),
// this catches it before we touch Postgres at all.
export async function checkHoldsOwnedBy(
  showId: string,
  seatIds: string[],
  sessionId: string,
): Promise<{ ok: true } | { ok: false; invalidSeatIds: string[] }> {
  const pipeline = redis.pipeline();
  seatIds.forEach((seatId) => pipeline.get(holdKey(showId, seatId)));
  const results = await pipeline.exec();

  const invalidSeatIds: string[] = [];
  seatIds.forEach((seatId, i) => {
    const owner = results?.[i]?.[1] as string | null;
    if (owner !== sessionId) invalidSeatIds.push(seatId);
  });

  return invalidSeatIds.length > 0 ? { ok: false, invalidSeatIds } : { ok: true };
}

export async function releaseHolds(showId: string, seatIds: string[], sessionId: string): Promise<void> {
  await Promise.all(seatIds.map((seatId) => releaseHold(showId, seatId, sessionId)));
}

// Batch lookup used when rendering the seat map: for every seat, who (if
// anyone) currently holds it. Returns a Map<seatId, ownerSessionId>.
export async function getHoldsForShow(
  showId: string,
  seatIds: string[],
): Promise<Map<string, string>> {
  if (seatIds.length === 0) return new Map();
  const pipeline = redis.pipeline();
  seatIds.forEach((seatId) => pipeline.get(holdKey(showId, seatId)));
  const results = await pipeline.exec();

  const map = new Map<string, string>();
  seatIds.forEach((seatId, i) => {
    const owner = results?.[i]?.[1] as string | null;
    if (owner) map.set(seatId, owner);
  });
  return map;
}

export async function getHoldTtl(showId: string, seatId: string): Promise<Date | null> {
  const ttl = await redis.ttl(holdKey(showId, seatId));
  if (ttl <= 0) return null;
  return new Date(Date.now() + ttl * 1000);
}

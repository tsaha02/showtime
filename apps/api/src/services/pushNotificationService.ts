import webpush from "web-push";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { checkHoldsOwnedBy } from "./seatHoldService";
import { SEAT_HOLD_TTL_SECONDS } from "@showtime/shared";

const isConfigured = Boolean(env.vapidPublicKey && env.vapidPrivateKey);
if (isConfigured) {
  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey!, env.vapidPrivateKey!);
}

export function isPushConfigured(): boolean {
  return isConfigured;
}

export function getVapidPublicKey(): string | null {
  return env.vapidPublicKey ?? null;
}

export async function saveSubscription(
  sessionId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { sessionId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    // A browser can re-POST the same subscription (e.g. the frontend
    // re-subscribes defensively on every page load) or hand a
    // previously-guest endpoint back after the same session logs in —
    // either way it's the same physical subscription, just re-confirm
    // which session currently owns it rather than erroring on the
    // unique `endpoint` conflict.
    update: { sessionId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

async function sendToSession(sessionId: string, payload: { title: string; body: string; url: string }): Promise<void> {
  const subs = await prisma.pushSubscription.findMany({ where: { sessionId } });
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
      } catch (err) {
        // A 404/410 means the push service itself says this
        // subscription is gone (user revoked permission, uninstalled
        // the browser profile, etc.) — clean it up so we stop trying.
        // Any other error (network blip, push service hiccup) is left
        // alone; it'll just fail again next time, which is fine — this
        // is a best-effort nudge, not a guaranteed-delivery system.
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await removeSubscription(sub.endpoint).catch(() => {});
        }
      }
    }),
  );
}

// How long before a hold actually expires we warn the user — fires at
// the 3:30 mark of the 5-minute hold, not right at the buzzer, so
// there's actually enough time left for them to come back, re-open the
// seat map, and complete checkout before the seats really do release.
const WARNING_LEAD_SECONDS = 90;
const WARNING_DELAY_MS = (SEAT_HOLD_TTL_SECONDS - WARNING_LEAD_SECONDS) * 1000;

interface PendingWarning {
  timer: NodeJS.Timeout;
  seatIds: Set<string>;
}

// In-memory, single-process — the same tradeoff Socket.io's room state
// already makes implicitly for anything not routed through its Redis
// adapter. A real multi-instance deployment would need this moved to
// something shared (e.g. a Redis sorted set polled or driven by
// keyspace notifications) so a warning scheduled on instance A still
// fires if instance B happens to handle the eventual check — out of
// scope for a single-Render-instance portfolio deployment, called out
// here rather than silently assumed away.
const pendingWarnings = new Map<string, PendingWarning>();
const warningKey = (sessionId: string, showId: string) => `${sessionId}:${showId}`;

// Called every time a seat hold succeeds (see seats.routes.ts). The
// first hold for a given (session, show) pair starts one timer; every
// later seat added to the same cart just joins that timer's tracked
// seat set instead of scheduling a second, redundant one — the goal is
// one "did you abandon this booking" nudge per attempt, not one per
// seat.
export function trackHeldSeat(sessionId: string, showId: string, seatId: string): void {
  if (!isConfigured) return;

  const key = warningKey(sessionId, showId);
  const existing = pendingWarnings.get(key);
  if (existing) {
    existing.seatIds.add(seatId);
    return;
  }

  const seatIds = new Set([seatId]);
  const timer = setTimeout(() => {
    pendingWarnings.delete(key);
    void fireWarningIfStillAbandoned(sessionId, showId, seatIds);
  }, WARNING_DELAY_MS);
  // Node would otherwise hold the process open for this timer's full
  // duration even during graceful shutdown / test runs — `unref()` lets
  // the process exit normally if this is the only thing left pending.
  timer.unref();
  pendingWarnings.set(key, { timer, seatIds });
}

// Called when a seat is explicitly released (see seats.routes.ts). If
// that empties this cart back out entirely, there's nothing left to
// warn about — cancel the timer rather than let it fire a pointless
// check 90 seconds later. A partial release (some seats still held)
// just shrinks the tracked set; the timer, and the eventual warning
// text's seat count, follow whatever's actually still held.
export function untrackHeldSeat(sessionId: string, showId: string, seatId: string): void {
  const key = warningKey(sessionId, showId);
  const existing = pendingWarnings.get(key);
  if (!existing) return;
  existing.seatIds.delete(seatId);
  if (existing.seatIds.size === 0) {
    clearTimeout(existing.timer);
    pendingWarnings.delete(key);
  }
}

// Called right after a booking for this (session, show) confirms (see
// bookingService.ts) — the whole point of the warning was to prevent an
// abandoned cart, so once checkout actually succeeds there's nothing
// left to warn about, regardless of which specific seats ended up in
// the confirmed booking vs. this tracked set.
export function cancelWarning(sessionId: string, showId: string): void {
  const key = warningKey(sessionId, showId);
  const existing = pendingWarnings.get(key);
  if (!existing) return;
  clearTimeout(existing.timer);
  pendingWarnings.delete(key);
}

async function fireWarningIfStillAbandoned(sessionId: string, showId: string, seatIds: Set<string>): Promise<void> {
  const idsArray = [...seatIds];
  // Re-check against Redis at fire time rather than trusting the
  // tracked set alone — a hold can also lapse on its own TTL (someone
  // idles past 5 minutes without ever explicitly releasing), and this
  // is the same ownership check the booking flow itself uses right
  // before charging a card (checkHoldsOwnedBy), so "still held" here
  // means the exact same thing it means everywhere else in this app.
  const check = await checkHoldsOwnedBy(showId, idsArray, sessionId);
  const stillHeldCount = check.ok ? idsArray.length : idsArray.length - check.invalidSeatIds.length;
  if (stillHeldCount === 0) return; // booked, released, or naturally expired — nothing to warn about

  const show = await prisma.show.findUnique({ where: { id: showId }, include: { movie: true, event: true } });
  if (!show) return;

  // Duplicated from bookingService.ts's `titleOfShow` rather than
  // imported from it — that module imports functions FROM this one
  // (cancelWarning, called after a booking confirms), so importing the
  // other way too would create a circular dependency between the two
  // for the sake of one trivial one-liner.
  const title = show.movie?.title ?? show.event!.title;
  const seatWord = stillHeldCount === 1 ? "seat" : "seats";
  await sendToSession(sessionId, {
    title: "Forgot to finish booking?",
    body: `You left ${stillHeldCount} ${seatWord} for ${title} unbooked — come back before they're released.`,
    url: `/shows/${showId}/seats`,
  });
}

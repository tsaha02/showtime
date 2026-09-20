import { Prisma } from "@prisma/client";
import { adjustWallet } from "./walletService";

export type LoyaltyTier = "BRONZE" | "SILVER" | "GOLD";

// Tiers are computed live from a confirmed-booking count, never stored
// on User — same reasoning as not storing a computed `averageRating` on
// Movie beyond what's already cached: there's exactly one source of
// truth (the Booking table), and a stored tier could silently drift from
// it (e.g. after a booking is cancelled) if every write path had to
// remember to keep it in sync.
const TIER_THRESHOLDS: { tier: LoyaltyTier; minBookings: number; cashbackPercent: number }[] = [
  { tier: "GOLD", minBookings: 15, cashbackPercent: 3 },
  { tier: "SILVER", minBookings: 5, cashbackPercent: 1 },
  { tier: "BRONZE", minBookings: 0, cashbackPercent: 0 },
];

export function tierForBookingCount(confirmedBookingCount: number): { tier: LoyaltyTier; cashbackPercent: number } {
  const match = TIER_THRESHOLDS.find((t) => confirmedBookingCount >= t.minBookings)!;
  return { tier: match.tier, cashbackPercent: match.cashbackPercent };
}

// Called once per confirmed booking (see bookingService.ts), after the
// booking row (and therefore this user's new confirmed-booking count)
// already exists. Cashback is a percentage of what was actually paid
// out of pocket — not the pre-discount total, not anything covered by
// wallet already — credited straight back into the wallet via the same
// `adjustWallet` every other wallet change goes through.
export async function applyLoyaltyCashback(
  tx: Prisma.TransactionClient,
  userId: string,
  bookingId: string,
  cashPaid: number,
): Promise<void> {
  if (cashPaid <= 0) return;
  const confirmedBookingCount = await tx.booking.count({ where: { userId, status: "CONFIRMED" } });
  const { cashbackPercent } = tierForBookingCount(confirmedBookingCount);
  if (cashbackPercent <= 0) return;

  const cashback = Math.floor((cashPaid * cashbackPercent) / 100);
  if (cashback <= 0) return;
  await adjustWallet(tx, userId, cashback, "LOYALTY_CASHBACK", bookingId);
}

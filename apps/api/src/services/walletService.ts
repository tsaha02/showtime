import type { Prisma, WalletReason } from "@prisma/client";

// Every wallet balance change goes through here: it's the only place
// that (a) writes an immutable WalletTransaction row explaining the
// change and (b) updates the denormalized `User.walletBalance` — always
// together, always in the same transaction as whatever caused it, so
// the running balance can never drift from what the ledger says
// happened. `tx` is always a Prisma transaction client, never the bare
// `prisma` client — a wallet change is never a standalone operation, it
// always happens alongside a booking, cancellation, or referral event.
export async function adjustWallet(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: number, // positive = credit, negative = debit
  reason: WalletReason,
  bookingId?: string,
): Promise<void> {
  await tx.user.update({ where: { id: userId }, data: { walletBalance: { increment: amount } } });
  await tx.walletTransaction.create({ data: { userId, amount, reason, bookingId } });
}

export const REFERRAL_BONUS_RUPEES = 100;

// Called once, right after a referred user's FIRST booking confirms
// (see bookingService.ts) — awarding it at signup instead would pay out
// for accounts that never actually book anything. Both the new user and
// whoever referred them get the bonus; `User.referralBonusAwarded`
// guards against ever paying it out twice for the same referred user.
export async function awardReferralBonusIfEligible(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user || !user.referredById || user.referralBonusAwarded) return;

  await adjustWallet(tx, userId, REFERRAL_BONUS_RUPEES, "REFERRAL_BONUS");
  await adjustWallet(tx, user.referredById, REFERRAL_BONUS_RUPEES, "REFERRAL_BONUS");
  await tx.user.update({ where: { id: userId }, data: { referralBonusAwarded: true } });
}

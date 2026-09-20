import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/ApiError";
import { generateGiftCardCode } from "../utils/giftCardCode";
import { adjustWallet } from "./walletService";

export const GIFT_CARD_PURPOSE = "gift_card_purchase";
export const MIN_GIFT_CARD_VALUE = 100;
export const MAX_GIFT_CARD_VALUE = 10000;

export function assertValidGiftCardValue(value: number): void {
  if (!Number.isInteger(value) || value < MIN_GIFT_CARD_VALUE || value > MAX_GIFT_CARD_VALUE) {
    throw ApiError.badRequest(`Gift card value must be between ₹${MIN_GIFT_CARD_VALUE} and ₹${MAX_GIFT_CARD_VALUE}`);
  }
}

// Redemption is the only place a GiftCard's value ever becomes spendable
// — it's a one-shot credit into the redeemer's wallet (see the model
// comment in schema.prisma for why this app doesn't track a separate
// "remaining balance" on the card itself). `redeemed` is checked and set
// inside the same transaction as the wallet credit, so a code can't be
// redeemed twice even under concurrent requests.
export async function redeemGiftCard(code: string, userId: string): Promise<{ value: number }> {
  return prisma.$transaction(async (tx) => {
    const card = await tx.giftCard.findUnique({ where: { code } });
    if (!card) throw ApiError.notFound("Gift card code not found");
    if (card.redeemed) throw ApiError.conflict("This gift card has already been redeemed");

    await tx.giftCard.update({
      where: { id: card.id },
      data: { redeemed: true, redeemedByUserId: userId, redeemedAt: new Date() },
    });
    await adjustWallet(tx, userId, card.value, "GIFT_CARD_REDEEMED");
    return { value: card.value };
  });
}

export async function createGiftCardRecord(input: {
  value: number;
  purchasedByEmail: string;
  purchasedByUserId: string | null;
  recipientEmail: string;
  message?: string | null;
  paymentIntentId: string | null;
}) {
  return prisma.giftCard.create({
    data: {
      code: generateGiftCardCode(),
      value: input.value,
      purchasedByEmail: input.purchasedByEmail,
      purchasedByUserId: input.purchasedByUserId,
      recipientEmail: input.recipientEmail,
      message: input.message ?? null,
      paymentIntentId: input.paymentIntentId,
    },
  });
}

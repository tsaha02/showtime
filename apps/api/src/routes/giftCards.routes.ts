import { Router } from "express";
import { purchaseGiftCardSchema, redeemGiftCardSchema } from "@showtime/shared";
import type { CreateGenericPaymentIntentResponseDTO, GiftCardPurchaseResponseDTO } from "@showtime/shared";
import { validateBody } from "../middleware/validate";
import { optionalCustomerAuth, requireCustomerAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { prisma } from "../lib/prisma";
import {
  assertValidGiftCardValue,
  createGiftCardRecord,
  redeemGiftCard,
  GIFT_CARD_PURPOSE,
} from "../services/giftCardService";
import {
  createGenericPaymentIntent,
  verifyGenericPaymentIntent,
  isStripeConfigured,
} from "../services/paymentService";
import { sendGiftCardEmail } from "../services/emailService";

const router = Router();

// Same shape as bookings' create-payment-intent: the amount Stripe is
// asked to charge is computed/validated server-side (assertValidGiftCard
// Value), never trusted from the client beyond "how much do you want to
// gift."
router.post(
  "/create-payment-intent",
  validateBody(purchaseGiftCardSchema.pick({ value: true })),
  asyncHandler(async (req, res) => {
    assertValidGiftCardValue(req.body.value);

    if (!isStripeConfigured()) {
      const body: CreateGenericPaymentIntentResponseDTO = { stripeConfigured: false };
      return res.json(body);
    }

    const intent = await createGenericPaymentIntent(req.body.value, GIFT_CARD_PURPOSE, {});
    const body: CreateGenericPaymentIntentResponseDTO = {
      stripeConfigured: true,
      clientSecret: intent!.clientSecret,
      paymentIntentId: intent!.paymentIntentId,
      amount: req.body.value,
    };
    res.json(body);
  }),
);

router.post(
  "/purchase",
  optionalCustomerAuth,
  validateBody(purchaseGiftCardSchema),
  asyncHandler(async (req, res) => {
    const { value, recipientEmail, message, paymentIntentId } = req.body;
    assertValidGiftCardValue(value);

    const loggedInEmail = req.user
      ? (await prisma.user.findUnique({ where: { id: req.user.id }, select: { email: true } }))?.email
      : undefined;
    const purchasedByEmail = loggedInEmail ?? req.body.purchasedByEmail;
    if (!purchasedByEmail) {
      throw ApiError.badRequest("purchasedByEmail is required when not logged in");
    }

    if (isStripeConfigured()) {
      if (!paymentIntentId) throw ApiError.badRequest("paymentIntentId is required");
      await verifyGenericPaymentIntent(paymentIntentId, { amountRupees: value, purpose: GIFT_CARD_PURPOSE });
      const alreadyUsed = await prisma.giftCard.findUnique({ where: { paymentIntentId } });
      if (alreadyUsed) throw ApiError.conflict("This payment has already been used for a gift card.");
    }
    // When Stripe isn't configured, gift card purchases use the same
    // always-succeeds mocked fallback as bookings — no separate flag to
    // simulate failure here, since this is a much lower-stakes purchase
    // than a seat booking and doesn't need its own failure-path demo.

    const card = await createGiftCardRecord({
      value,
      purchasedByEmail,
      purchasedByUserId: req.user?.id ?? null,
      recipientEmail,
      message,
      paymentIntentId: isStripeConfigured() ? paymentIntentId! : null,
    });

    sendGiftCardEmail(recipientEmail, card.code, value, purchasedByEmail, message).catch((err) =>
      console.error("[gift-card] failed to send delivery email:", err),
    );

    const body: GiftCardPurchaseResponseDTO = { code: card.code, value };
    res.status(201).json(body);
  }),
);

router.post(
  "/redeem",
  requireCustomerAuth,
  validateBody(redeemGiftCardSchema),
  asyncHandler(async (req, res) => {
    const { value } = await redeemGiftCard(req.body.code.trim().toUpperCase(), req.user!.id);
    res.json({ value });
  }),
);

export default router;

import { Router } from "express";
import {
  confirmBookingSchema,
  findBookingSchema,
  createPaymentIntentSchema,
  previewCouponSchema,
  cancelBookingSchema,
} from "@showtime/shared";
import type { CreatePaymentIntentResponseDTO, CouponPreviewDTO } from "@showtime/shared";
import { validateBody } from "../middleware/validate";
import { optionalCustomerAuth, requireCustomerAuth, requireSessionId } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { prisma } from "../lib/prisma";
import { confirmBooking, cancelBooking, bookingToDTO, computeSeatsPricing, computeBookingCharges } from "../services/bookingService";
import { checkHoldsOwnedBy } from "../services/seatHoldService";
import { createPaymentIntent, isStripeConfigured, seatIdsKey } from "../services/paymentService";
import { applyCoupon } from "../services/couponService";

const router = Router();

const bookingInclude = {
  show: { include: { movie: true, event: true, screen: { include: { theatre: true } } } },
  foodItems: true,
} as const;

// Called right before the frontend mounts Stripe Elements. Requires the
// caller to actually hold the seats being priced (same Redis check
// confirmBooking does) — no reason to let anyone spin up a real Stripe
// PaymentIntent for seats they haven't even selected.
router.post(
  "/create-payment-intent",
  requireSessionId,
  optionalCustomerAuth,
  validateBody(createPaymentIntentSchema),
  asyncHandler(async (req, res) => {
    const { showId, seatIds, couponCode, foodItems, useWallet, roundUpDonation } = req.body;

    const holdCheck = await checkHoldsOwnedBy(showId, seatIds, req.sessionId);
    if (!holdCheck.ok) {
      throw ApiError.conflict("Your hold on one or more seats has expired. Please reselect your seats.", {
        invalidSeatIds: holdCheck.invalidSeatIds,
      });
    }

    // The exact same pricing pipeline confirmBooking() re-runs and
    // verifies against — see computeBookingCharges's comment for why
    // this must be a single shared function, not two copies of the same
    // arithmetic.
    const { finalAmount } = await computeBookingCharges({
      showId,
      seatIds,
      couponCode,
      foodItems,
      useWallet,
      roundUpDonation,
      userId: req.user?.id,
    });

    if (!isStripeConfigured() || finalAmount === 0) {
      // Nothing for Stripe to do — either it's not configured (mocked
      // payment fallback) or the wallet already covers the whole order
      // (Stripe can't create a ₹0 PaymentIntent either way).
      const body: CreatePaymentIntentResponseDTO = { stripeConfigured: false };
      return res.json(body);
    }

    const intent = await createPaymentIntent(finalAmount, {
      showId,
      seatIds: seatIdsKey(seatIds),
      sessionId: req.sessionId,
    });
    const body: CreatePaymentIntentResponseDTO = {
      stripeConfigured: true,
      clientSecret: intent!.clientSecret,
      paymentIntentId: intent!.paymentIntentId,
      amount: finalAmount,
    };
    res.json(body);
  }),
);

// Informational only — lets the checkout UI show "₹50 off" before the
// user commits. Never mutates anything (no usage increment here); the
// coupon is re-validated and actually consumed inside confirmBooking().
router.post(
  "/preview-coupon",
  requireSessionId,
  validateBody(previewCouponSchema),
  asyncHandler(async (req, res) => {
    const { code, showId, seatIds } = req.body;
    const { totalAmount } = await computeSeatsPricing(showId, seatIds);

    try {
      const { discountAmount, finalAmount } = await applyCoupon(totalAmount, code);
      const body: CouponPreviewDTO = { valid: true, message: "Coupon applied", discountAmount, finalAmount };
      res.json(body);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Invalid coupon code";
      const body: CouponPreviewDTO = { valid: false, message, discountAmount: 0, finalAmount: totalAmount };
      res.json(body);
    }
  }),
);

router.post(
  "/confirm",
  requireSessionId,
  optionalCustomerAuth,
  validateBody(confirmBookingSchema),
  asyncHandler(async (req, res) => {
    const booking = await confirmBooking(req.body, {
      sessionId: req.sessionId,
      userId: req.user?.id,
    });
    res.status(201).json({ booking });
  }),
);

router.get(
  "/mine",
  requireCustomerAuth,
  asyncHandler(async (req, res) => {
    const bookings = await prisma.booking.findMany({
      where: { userId: req.user!.id },
      include: bookingInclude,
      orderBy: { createdAt: "desc" },
    });
    res.json({ bookings: bookings.map(bookingToDTO) });
  }),
);

router.post(
  "/find",
  validateBody(findBookingSchema),
  asyncHandler(async (req, res) => {
    const { reference, email } = req.body;
    const booking = await prisma.booking.findUnique({
      where: { reference },
      include: bookingInclude,
    });
    // Same 404 whether the reference doesn't exist or the email doesn't
    // match, so this endpoint can't be used to probe for valid reference
    // codes or confirm which email a booking belongs to.
    if (!booking || booking.guestEmail?.toLowerCase() !== email.toLowerCase()) {
      throw ApiError.notFound("No booking found for that reference and email");
    }
    res.json({ booking: bookingToDTO(booking) });
  }),
);

// Optional auth, not required: a logged-in customer cancels with no
// body (their session cookie is the proof), but a guest — who has no
// account to be logged into — proves ownership the same way "Find my
// booking" already does, by sending the email their booking was made
// under. Exactly one of those two must check out, or cancelBooking()
// itself rejects it (see its comment) — this route just decides which
// kind of proof it's even looking at.
router.post(
  "/:id/cancel",
  optionalCustomerAuth,
  validateBody(cancelBookingSchema),
  asyncHandler(async (req, res) => {
    if (!req.user && !req.body.email) {
      throw ApiError.badRequest("Log in, or provide the email this booking was made under, to cancel it");
    }
    await cancelBooking(req.params.id, { userId: req.user?.id, guestEmail: req.body.email });
    res.status(204).send();
  }),
);

export default router;

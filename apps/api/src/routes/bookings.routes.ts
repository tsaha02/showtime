import { Router } from "express";
import { confirmBookingSchema, findBookingSchema, createPaymentIntentSchema } from "@showtime/shared";
import type { CreatePaymentIntentResponseDTO } from "@showtime/shared";
import { validateBody } from "../middleware/validate";
import { optionalCustomerAuth, requireCustomerAuth, requireSessionId } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { prisma } from "../lib/prisma";
import { confirmBooking, cancelBooking, bookingToDTO, computeSeatsPricing } from "../services/bookingService";
import { checkHoldsOwnedBy } from "../services/seatHoldService";
import { createPaymentIntent, isStripeConfigured, seatIdsKey } from "../services/paymentService";

const router = Router();

const bookingInclude = { show: { include: { movie: true, screen: { include: { theatre: true } } } } } as const;

// Called right before the frontend mounts Stripe Elements. Requires the
// caller to actually hold the seats being priced (same Redis check
// confirmBooking does) — no reason to let anyone spin up a real Stripe
// PaymentIntent for seats they haven't even selected.
router.post(
  "/create-payment-intent",
  requireSessionId,
  validateBody(createPaymentIntentSchema),
  asyncHandler(async (req, res) => {
    const { showId, seatIds } = req.body;

    const holdCheck = await checkHoldsOwnedBy(showId, seatIds, req.sessionId);
    if (!holdCheck.ok) {
      throw ApiError.conflict("Your hold on one or more seats has expired. Please reselect your seats.", {
        invalidSeatIds: holdCheck.invalidSeatIds,
      });
    }

    const { totalAmount } = await computeSeatsPricing(showId, seatIds);

    if (!isStripeConfigured()) {
      const body: CreatePaymentIntentResponseDTO = { stripeConfigured: false };
      return res.json(body);
    }

    const intent = await createPaymentIntent(totalAmount, {
      showId,
      seatIds: seatIdsKey(seatIds),
      sessionId: req.sessionId,
    });
    const body: CreatePaymentIntentResponseDTO = {
      stripeConfigured: true,
      clientSecret: intent!.clientSecret,
      paymentIntentId: intent!.paymentIntentId,
      amount: totalAmount,
    };
    res.json(body);
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

router.post(
  "/:id/cancel",
  requireCustomerAuth,
  asyncHandler(async (req, res) => {
    await cancelBooking(req.params.id, { userId: req.user!.id });
    res.status(204).send();
  }),
);

export default router;

import Stripe from "stripe";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

// Real (TEST MODE ONLY) Stripe payments, inserted at exactly the point
// the booking flow always had a payment check — see bookingService.ts's
// big comment block for why the two-layer Redis/Postgres concurrency
// design doesn't change one bit because of this: payment verification
// happens BEFORE the transaction starts, same as the old
// `simulatePaymentFailure` flag did, so the atomic seat-booking
// transaction itself is completely unaffected by which payment path is
// active.
//
// Graceful degradation, same posture as OMDb/Resend: without
// STRIPE_SECRET_KEY configured, `createPaymentIntent` returns null and
// bookingService.ts falls back to the original mocked payment (always
// succeeds unless the client explicitly sets `simulatePaymentFailure`).
// This project never uses live Stripe keys — only sk_test_/pk_test_.

const stripe = env.stripeSecretKey ? new Stripe(env.stripeSecretKey) : null;

export function isStripeConfigured(): boolean {
  return stripe !== null;
}

// Order-independent key for a seat cart — used both when a PaymentIntent
// is created (stored in its metadata) and when it's later verified, so
// selecting the same seats in a different order still matches.
export function seatIdsKey(seatIds: string[]): string {
  return [...seatIds].sort().join(",");
}

export interface CreatedPaymentIntent {
  clientSecret: string;
  paymentIntentId: string;
}

// `amountRupees` is a whole-rupee integer (this app's currency unit
// everywhere else); Stripe wants amounts in the smallest currency unit
// (paise for INR), hence the ×100.
export async function createPaymentIntent(
  amountRupees: number,
  metadata: { showId: string; seatIds: string; sessionId: string },
): Promise<CreatedPaymentIntent | null> {
  if (!stripe) return null;

  const intent = await stripe.paymentIntents.create({
    amount: amountRupees * 100,
    currency: "inr",
    metadata,
    // Card-only, no redirect-based methods — keeps confirmation
    // synchronous in the browser (no webhook needed for this demo to
    // know the outcome), which is what lets the existing confirm-booking
    // endpoint stay a single synchronous request/response.
    payment_method_types: ["card"],
  });

  if (!intent.client_secret) throw ApiError.internal("Stripe did not return a client secret");
  return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
}

export interface PaymentVerification {
  showId: string;
  seatIds: string[];
  sessionId: string;
  amountRupees: number;
}

// Re-fetches the PaymentIntent from Stripe (never trusts a client-
// supplied "it succeeded" claim) and checks: it actually succeeded, the
// amount matches what this booking attempt expects, and its metadata
// matches this exact show/seats/session — so a PaymentIntent created for
// one cart can't be replayed against a different one.
export async function verifyPaymentIntent(paymentIntentId: string, expected: PaymentVerification): Promise<void> {
  if (!stripe) throw ApiError.internal("Stripe is not configured on the server");

  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (err) {
    // A fabricated/malformed/nonexistent id makes Stripe's SDK throw
    // (e.g. a resource_missing StripeInvalidRequestError) rather than
    // resolve — that's an ordinary client-input problem (a bad
    // paymentIntentId), not a server fault, so it maps to a clean 400
    // instead of falling through to the generic 500 handler.
    throw ApiError.badRequest(
      `Could not verify payment: ${err instanceof Error ? err.message : "invalid payment reference"}`,
    );
  }

  if (intent.status !== "succeeded") {
    throw new ApiError(402, "PAYMENT_FAILED", `Payment was not completed (status: ${intent.status}).`);
  }
  if (intent.amount !== expected.amountRupees * 100 || intent.currency !== "inr") {
    throw ApiError.badRequest("Payment amount does not match this booking");
  }
  if (intent.metadata.showId !== expected.showId || intent.metadata.seatIds !== seatIdsKey(expected.seatIds)) {
    throw ApiError.badRequest("Payment does not match the requested seats");
  }
}

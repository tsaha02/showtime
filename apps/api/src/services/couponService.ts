import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/ApiError";
import type { Coupon, Prisma } from "@prisma/client";

// The ONE place discount math happens — used by both the checkout
// preview endpoint (POST /api/bookings/preview-coupon, informational
// only) and the real confirm step inside bookingService.ts. Sharing this
// function is what guarantees the preview a user sees is exactly what
// they're actually charged, not just a client-side approximation that
// could drift from the server's real calculation.
export function calculateDiscount(coupon: Pick<Coupon, "type" | "value">, amountRupees: number): number {
  const raw = coupon.type === "PERCENT" ? Math.round((amountRupees * coupon.value) / 100) : coupon.value;
  return Math.min(raw, amountRupees); // never discount below zero
}

// Re-checked from scratch every time a coupon is used (preview AND
// confirm) — a code's validity (active, not expired, under its cap) can
// change between when a user types it in and when they actually pay,
// same principle as re-validating a seat hold right before booking
// rather than trusting an earlier check.
export async function validateCoupon(code: string): Promise<Coupon> {
  const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
  if (!coupon) throw ApiError.badRequest("Invalid coupon code");
  if (!coupon.active) throw ApiError.badRequest("This coupon is no longer active");
  if (coupon.expiresAt && coupon.expiresAt < new Date()) throw ApiError.badRequest("This coupon has expired");
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    throw ApiError.badRequest("This coupon has reached its usage limit");
  }
  return coupon;
}

export interface AppliedDiscount {
  coupon: Coupon | null;
  discountAmount: number;
  finalAmount: number;
}

// The one place "subtotal + optional coupon code -> what's actually
// owed" is computed — used by both POST /api/bookings/create-payment-intent
// (so the Stripe charge is for the discounted amount) and confirmBooking
// (so the stored discount/verification math can never disagree with what
// was actually charged). `couponCode` is optional — omitting it (or it
// being empty) always returns a no-op discount rather than an error.
export async function applyCoupon(subtotalRupees: number, couponCode?: string): Promise<AppliedDiscount> {
  if (!couponCode) return { coupon: null, discountAmount: 0, finalAmount: subtotalRupees };

  const coupon = await validateCoupon(couponCode);
  const discountAmount = calculateDiscount(coupon, subtotalRupees);
  return { coupon, discountAmount, finalAmount: subtotalRupees - discountAmount };
}

// Called only from inside the booking transaction, after a coupon has
// already been validated — increments usedCount atomically as part of
// the same all-or-nothing unit as the booking itself, so a coupon's use
// count can never drift from how many bookings actually used it (e.g. if
// the booking transaction later rolled back for an unrelated reason,
// this increment rolls back with it).
export function incrementCouponUsage(tx: Prisma.TransactionClient, couponId: string) {
  return tx.coupon.update({ where: { id: couponId }, data: { usedCount: { increment: 1 } } });
}

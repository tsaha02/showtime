import { prisma } from "../lib/prisma";

// "Round up and give the difference" — computed off the pre-donation
// total (seats − discount + food), never off itself, so both
// create-payment-intent and confirmBooking can compute the identical
// number without any circularity. Rounds up to the next ₹10; a total
// that's already a multiple of ten donates nothing, same as any real
// round-up-at-checkout feature.
export function computeDonationAmount(baseTotal: number, roundUpDonation: boolean | undefined): number {
  if (!roundUpDonation || baseTotal <= 0) return 0;
  return (10 - (baseTotal % 10)) % 10;
}

// Powers the public "₹X raised" counter — see donations.routes.ts. Demo
// feature: this is a sum over Bookings' `donationAmount`, not a real
// charity payout; the checkout UI says so explicitly.
export async function getTotalDonations(): Promise<number> {
  const result = await prisma.booking.aggregate({
    where: { status: "CONFIRMED" },
    _sum: { donationAmount: true },
  });
  return result._sum.donationAmount ?? 0;
}

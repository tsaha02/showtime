import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/ApiError";
import { generateBookingReference } from "../utils/bookingRef";
import { checkHoldsOwnedBy, releaseHolds } from "./seatHoldService";
import { sendBookingTicketEmail } from "./emailService";
import { isStripeConfigured, verifyPaymentIntent, refundPaymentIntent } from "./paymentService";
import { applyCoupon, incrementCouponUsage } from "./couponService";
import { computeFoodCart } from "./foodService";
import { computeDonationAmount } from "./donationService";
import { adjustWallet, awardReferralBonusIfEligible } from "./walletService";
import { applyLoyaltyCashback } from "./loyaltyService";
import { emitSeatBooked, emitSeatReleased, emitBookingConfirmed } from "../lib/socket";
import type { BookingDTO, BookingSeatDTO, ConfirmBookingInput } from "@showtime/shared";

// `Show` is generic (a session for a Movie OR an Event — see the
// schema comment on `Event`), so every place that used to read
// `show.movie.title` unconditionally now goes through this helper
// instead of repeating the `movie?.title ?? event!.title` fallback at
// each call site.
export function titleOfShow(show: { movie: { title: string } | null; event: { title: string } | null }): string {
  return show.movie?.title ?? show.event!.title;
}

// Shared by confirmBooking() and the create-payment-intent endpoint —
// both need "what does this cart of seats cost, on this show, right
// now" before they do anything else (starting a charge, or starting the
// booking transaction). Kept as one function so the two can never
// silently disagree on price.
export async function computeSeatsPricing(showId: string, seatIds: string[]) {
  const show = await prisma.show.findUnique({
    where: { id: showId },
    include: { prices: true, movie: true, event: true, screen: { include: { theatre: true } } },
  });
  if (!show) throw ApiError.notFound("Show not found");

  const seats = await prisma.seat.findMany({ where: { id: { in: seatIds } } });
  if (seats.length !== seatIds.length) throw ApiError.badRequest("One or more seats do not exist");

  const priceByCategory = new Map(show.prices.map((p) => [p.category, p.price]));
  for (const seat of seats) {
    if (!priceByCategory.has(seat.category)) {
      throw ApiError.internal(`No price configured for category ${seat.category} on this show`);
    }
  }

  const seatsSnapshot: BookingSeatDTO[] = seats.map((seat) => ({
    seatId: seat.id,
    label: seat.label,
    category: seat.category,
    price: priceByCategory.get(seat.category)!,
  }));
  const totalAmount = seatsSnapshot.reduce((sum, s) => sum + s.price, 0);

  return { show, seatsSnapshot, totalAmount };
}

export interface BookingChargesInput {
  showId: string;
  seatIds: string[];
  couponCode?: string;
  foodItems?: { foodItemId: string; quantity: number }[];
  useWallet?: boolean;
  roundUpDonation?: boolean;
  userId?: string;
}

// THE single place the checkout total is computed — seats → − coupon →
// + food → + donation round-up → − wallet. `create-payment-intent` and
// `confirmBooking` both call this and NOTHING ELSE to arrive at
// `finalAmount`, specifically because this pipeline has already drifted
// out of sync between the two call sites twice (once for food/wallet,
// once for the donation round-up) when each endpoint re-implemented the
// arithmetic separately — a real bug this project's own testing caught
// both times, not a hypothetical one. If a new checkout line item is
// ever added, it belongs HERE, not duplicated into both routes again.
export async function computeBookingCharges(input: BookingChargesInput) {
  const { showId, seatIds, couponCode, foodItems, useWallet, roundUpDonation, userId } = input;

  const { show, seatsSnapshot, totalAmount } = await computeSeatsPricing(showId, seatIds);
  const { coupon, discountAmount } = await applyCoupon(totalAmount, couponCode);
  const { lines: foodLines, foodTotal } = await computeFoodCart(foodItems);
  const donationAmount = computeDonationAmount(totalAmount - discountAmount + foodTotal, roundUpDonation);
  const preWalletTotal = totalAmount - discountAmount + foodTotal + donationAmount;

  let walletAmountUsed = 0;
  if (useWallet && userId) {
    const account = await prisma.user.findUnique({ where: { id: userId }, select: { walletBalance: true } });
    walletAmountUsed = Math.min(account?.walletBalance ?? 0, preWalletTotal);
  }
  const finalAmount = preWalletTotal - walletAmountUsed;

  return {
    show,
    seatsSnapshot,
    totalAmount,
    coupon,
    discountAmount,
    foodLines,
    foodTotal,
    donationAmount,
    walletAmountUsed,
    finalAmount,
  };
}

// ============================================================================
// THE CENTERPIECE: race-condition-safe booking.
//
// Two independent layers guard against double-booking a seat, and they
// exist for different reasons:
//
//   1. THE REDIS HOLD (see seatHoldService.ts) is the fast, cheap first
//      line of defense. `SET seat:{showId}:{seatId} NX EX 300` means only
//      one session can ever "own" a seat at a time, so under normal
//      operation two users literally cannot both select the same seat —
//      the second one is rejected immediately with a friendly message,
//      before any database work happens. This is what makes the seat map
//      feel instant and correct in the UI.
//
//   2. THE POSTGRES UNIQUE CONSTRAINT on BookingSeat(showId, seatId) is
//      the actual guarantee. Redis holds are advisory and best-effort:
//      Redis could be restarted (losing the lock, though not the booking
//      data — Postgres is untouched), a hold's 5-minute TTL could expire
//      because a slow guest checkout took 6 minutes, or (in a multi-
//      instance deployment) a network partition could let two instances
//      briefly disagree. In every one of those cases, Redis alone could
//      let two "confirm" requests both believe they're clear to book the
//      same seat. The database is the tiebreaker: whichever INSERT
//      commits first wins, and the second one fails on the unique
//      constraint — atomically, at the storage layer, regardless of what
//      either request's application code believed a moment earlier.
//
// This function therefore does both, in order: it re-checks the Redis
// hold (catches the common case — "your hold expired, please reselect" —
// with a fast, specific error) and then relies on the Postgres unique
// constraint inside a transaction (catches everything else, including
// Redis being wrong or unavailable).
//
// See scripts/race-test.ts for a standalone script that bypasses the
// Redis check entirely and fires two concurrent bookings at the same
// seat directly at this function's transaction core, to prove the
// database constraint alone is sufficient.
// ============================================================================

interface ConfirmContext {
  sessionId: string;
  userId?: string;
}

export async function confirmBooking(
  input: ConfirmBookingInput,
  ctx: ConfirmContext,
): Promise<BookingDTO> {
  const {
    showId,
    seatIds,
    guestDetails,
    simulatePaymentFailure,
    paymentIntentId,
    couponCode,
    foodItems,
    useWallet,
    roundUpDonation,
  } = input;

  // A booking belongs to EITHER a logged-in user OR a guest, never both,
  // never neither. userId comes from the auth cookie (server-trusted);
  // guestDetails comes from the request body and is only used when there
  // is no authenticated user.
  const isGuest = !ctx.userId;
  if (isGuest && !guestDetails) {
    throw ApiError.badRequest("Guest details are required when not logged in");
  }

  // Re-validated from scratch here — never trusted from an earlier
  // preview-coupon/create-payment-intent response or from whatever
  // amount the client claims — see computeBookingCharges's own comment
  // for why this MUST be the one function both endpoints call, not a
  // second copy of the same arithmetic.
  const { show, seatsSnapshot, totalAmount, coupon, discountAmount, foodLines, foodTotal, donationAmount, walletAmountUsed, finalAmount } =
    await computeBookingCharges({ showId, seatIds, couponCode, foodItems, useWallet, roundUpDonation, userId: ctx.userId });

  // --- Layer 1: Redis hold re-validation ---
  // Catches the common, expected case: the hold TTL ran out while the
  // user was filling in guest details / reviewing the cart, or another
  // tab/session released it. Fails fast, before touching Postgres.
  const holdCheck = await checkHoldsOwnedBy(showId, seatIds, ctx.sessionId);
  if (!holdCheck.ok) {
    throw ApiError.conflict(
      "Your hold on one or more seats has expired. Please reselect your seats.",
      { invalidSeatIds: holdCheck.invalidSeatIds },
    );
  }

  // --- Payment ---
  // Three modes: fully covered by wallet (nothing to charge at all —
  // skip Stripe/mock entirely), Stripe (STRIPE_SECRET_KEY configured),
  // or the mocked fallback. Switching between the latter two requires no
  // change anywhere else in this function or the transaction below,
  // since either way what leaves this block is just "payment is good,
  // proceed" or a thrown 402.
  if (finalAmount === 0) {
    // Nothing to verify — the wallet already covers the whole order.
    // Stripe can't even create a ₹0 PaymentIntent, so this has to be a
    // distinct branch, not just "verify a zero-amount charge."
  } else if (isStripeConfigured()) {
    if (!paymentIntentId) throw ApiError.badRequest("paymentIntentId is required");
    // Re-fetches the PaymentIntent from Stripe itself rather than
    // trusting the client's word that payment succeeded, and checks its
    // amount/seats/session match this exact attempt (see
    // paymentService.ts's verifyPaymentIntent for why).
    await verifyPaymentIntent(paymentIntentId, {
      showId,
      seatIds,
      sessionId: ctx.sessionId,
      amountRupees: finalAmount,
    });
    // A PaymentIntent can only ever be attached to one booking — see the
    // comment on Booking.paymentIntentId. Checked explicitly here (rather
    // than only relying on the unique constraint below) so a replayed
    // PaymentIntent gets a clear, specific error instead of falling into
    // the seat-conflict P2002 handler, which would misreport the cause.
    const alreadyUsed = await prisma.booking.findUnique({ where: { paymentIntentId } });
    if (alreadyUsed) throw ApiError.conflict("This payment has already been used for a booking.");
  } else {
    // Payment is mocked. This flag exists purely so the race-condition /
    // timeout paths can be exercised on demand in a demo: a "failed
    // payment" must leave no trace in the database and must NOT release
    // the seat's hold (the user should be able to immediately retry
    // payment on the same held seats, exactly like a real gateway
    // decline).
    if (simulatePaymentFailure) {
      throw new ApiError(402, "PAYMENT_FAILED", "Payment could not be processed. Please try again.");
    }
  }

  const reference = generateBookingReference();

  let bookingId: string;
  try {
    // --- Layer 2: Postgres transaction + unique constraint ---
    // Everything below is one all-or-nothing unit: either every
    // BookingSeat row is inserted alongside the Booking row, or NONE of
    // them are (the transaction rolls back). This is also exactly what
    // makes group bookings atomic — a 4-seat group booking either
    // reserves all 4 seats or none of them, there is no partial state.
    const booking = await prisma.$transaction(async (tx) => {
      const created = await tx.booking.create({
        data: {
          reference,
          status: "CONFIRMED",
          showId,
          userId: ctx.userId ?? null,
          guestName: guestDetails?.guestName ?? null,
          guestEmail: guestDetails?.guestEmail ?? null,
          guestPhone: guestDetails?.guestPhone ?? null,
          totalAmount,
          couponCode: coupon?.code ?? null,
          discountAmount,
          foodTotal,
          walletAmountUsed,
          donationAmount,
          seatsSnapshot: seatsSnapshot as unknown as Prisma.InputJsonValue,
          paymentIntentId: finalAmount === 0 ? null : (paymentIntentId ?? null),
        },
      });

      if (coupon) await incrementCouponUsage(tx, coupon.id);

      if (foodLines.length > 0) {
        await tx.bookingFoodItem.createMany({
          data: foodLines.map((f) => ({
            bookingId: created.id,
            foodItemId: f.foodItemId,
            name: f.name,
            price: f.price,
            quantity: f.quantity,
          })),
        });
      }

      if (walletAmountUsed > 0 && ctx.userId) {
        await adjustWallet(tx, ctx.userId, -walletAmountUsed, "SPENT_AT_CHECKOUT", created.id);
      }

      // Referral bonus pays out on a referred user's FIRST confirmed
      // booking — checked here, inside the transaction, using the
      // booking just created as the marker (if this is the only
      // CONFIRMED booking this user has, this is their first).
      if (ctx.userId) {
        const confirmedCount = await tx.booking.count({ where: { userId: ctx.userId, status: "CONFIRMED" } });
        if (confirmedCount === 1) await awardReferralBonusIfEligible(tx, ctx.userId);
        // Loyalty cashback is a percentage of what was actually paid out
        // of pocket (finalAmount) — not the pre-discount seat price, not
        // anything already covered by wallet.
        await applyLoyaltyCashback(tx, ctx.userId, created.id, finalAmount);
      }

      // createMany fails as a single statement if ANY row violates the
      // (showId, seatId) unique constraint — Postgres won't insert 3 of
      // 4 seats and silently skip the 4th. That all-or-nothing behavior
      // is exactly what group bookings need, and it's what turns "seat
      // already booked" into a clean transaction-level failure instead
      // of a partial booking.
      await tx.bookingSeat.createMany({
        data: seatsSnapshot.map((s) => ({
          bookingId: created.id,
          showId,
          seatId: s.seatId,
          category: s.category,
          price: s.price,
        })),
      });

      return created;
    });
    bookingId = booking.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Unique constraint violation: another transaction committed a
      // BookingSeat for one of these (showId, seatId) pairs first. Find
      // out which seats, so the client can show a specific, actionable
      // message instead of just "something went wrong".
      const conflicting = await prisma.bookingSeat.findMany({
        where: { showId, seatId: { in: seatIds } },
        select: { seatId: true },
      });
      throw ApiError.conflict(
        "One or more selected seats were just booked by someone else.",
        { conflictingSeatIds: conflicting.map((c) => c.seatId) },
      );
    }
    throw err;
  }

  // Only after the transaction has committed do we touch Redis/Socket.io.
  // Releasing the hold here (rather than leaving it to expire) frees the
  // key immediately instead of leaving a stale 5-minute lock on a seat
  // that Postgres now says is booked (harmless either way, since BOOKED
  // status is checked first, but there's no reason to wait).
  await releaseHolds(showId, seatIds, ctx.sessionId);
  emitSeatBooked({ showId, seatIds });

  const dto: BookingDTO = {
    id: bookingId,
    reference,
    status: "CONFIRMED",
    showId,
    movieTitle: titleOfShow(show),
    theatreName: show.screen.theatre.name,
    screenName: show.screen.name,
    showStartTime: show.startTime.toISOString(),
    seats: seatsSnapshot,
    totalAmount,
    couponCode: coupon?.code ?? null,
    discountAmount,
    foodItems: foodLines.map((f) => ({ name: f.name, price: f.price, quantity: f.quantity })),
    foodTotal,
    walletAmountUsed,
    donationAmount,
    guestName: guestDetails?.guestName ?? null,
    guestEmail: guestDetails?.guestEmail ?? null,
    createdAt: new Date().toISOString(),
  };

  emitBookingConfirmed(showId, { booking: dto });

  // Fire-and-forget, deliberately not awaited: the booking is already
  // durably committed in Postgres by this point (that's the whole point
  // of the transaction above) — a slow or failing email provider must
  // never delay this response or be mistaken for the booking itself
  // failing. Works identically for guests (guestEmail from the request)
  // and logged-in users (their account email, looked up here since the
  // request body never carries it for that path).
  void (async () => {
    const recipientEmail =
      guestDetails?.guestEmail ??
      (ctx.userId ? (await prisma.user.findUnique({ where: { id: ctx.userId }, select: { email: true } }))?.email : undefined);
    if (recipientEmail) await sendBookingTicketEmail(recipientEmail, dto);
  })().catch((err) => console.error("[email] Failed to send booking ticket email:", err));

  return dto;
}

export async function cancelBooking(bookingId: string, ctx: { userId: string }): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { bookingSeats: true },
  });
  if (!booking) throw ApiError.notFound("Booking not found");
  if (booking.userId !== ctx.userId) throw ApiError.forbidden("You can only cancel your own bookings");
  if (booking.status !== "CONFIRMED") throw ApiError.badRequest("Only confirmed bookings can be cancelled");

  const seatIds = booking.bookingSeats.map((s) => s.seatId);
  // What was actually paid out-of-pocket (cash/card), as opposed to the
  // wallet credit already spent — the two are refunded through different
  // paths below. Includes `donationAmount`: this app has no partial/
  // line-item refund mechanism (food isn't carved out of a refund
  // either), so cancelling refunds the whole charge, the round-up
  // donation included — a real product might choose to keep the
  // donation non-refundable, but that needs Stripe's partial-refund
  // amount parameter, which nothing else here uses yet.
  const cashPaid =
    booking.totalAmount - booking.discountAmount + booking.foodTotal + booking.donationAmount - booking.walletAmountUsed;

  // Resolved before the transaction opens — refunding is a network call
  // to Stripe, and a DB transaction shouldn't sit open across one. If a
  // real charge exists, try to refund it there first; on any failure
  // (or if there was never a real charge — a mocked payment, since
  // Stripe wasn't configured), the cash portion is refunded as a wallet
  // credit instead.
  let cashRefundToWallet = 0;
  if (cashPaid > 0) {
    if (booking.paymentIntentId) {
      try {
        await refundPaymentIntent(booking.paymentIntentId);
      } catch {
        cashRefundToWallet = cashPaid;
      }
    } else {
      cashRefundToWallet = cashPaid;
    }
  }

  // Deleting the BookingSeat rows is what frees the seats — see the
  // comment on the BookingSeat model in schema.prisma for why this
  // (rather than a status column + partial index) is the seat-release
  // mechanism. The Booking row itself, with its immutable seatsSnapshot,
  // is kept as CANCELLED for history.
  await prisma.$transaction(async (tx) => {
    await tx.bookingSeat.deleteMany({ where: { bookingId } });
    await tx.booking.update({ where: { id: bookingId }, data: { status: "CANCELLED" } });

    if (booking.walletAmountUsed > 0) {
      await adjustWallet(tx, ctx.userId, booking.walletAmountUsed, "CANCELLATION_REFUND", bookingId);
    }
    if (cashRefundToWallet > 0) {
      await adjustWallet(tx, ctx.userId, cashRefundToWallet, "CANCELLATION_REFUND", bookingId);
    }
  });

  for (const seatId of seatIds) {
    emitSeatReleased({ showId: booking.showId, seatId });
  }
}

export function bookingToDTO(booking: {
  id: string;
  reference: string;
  status: string;
  showId: string;
  totalAmount: number;
  couponCode: string | null;
  discountAmount: number;
  foodTotal: number;
  walletAmountUsed: number;
  donationAmount: number;
  seatsSnapshot: Prisma.JsonValue;
  foodItems: { name: string; price: number; quantity: number }[];
  guestName: string | null;
  guestEmail: string | null;
  createdAt: Date;
  show: {
    startTime: Date;
    movie: { title: string } | null;
    event: { title: string } | null;
    screen: { name: string; theatre: { name: string } };
  };
}): BookingDTO {
  return {
    id: booking.id,
    reference: booking.reference,
    status: booking.status as BookingDTO["status"],
    showId: booking.showId,
    movieTitle: titleOfShow(booking.show),
    theatreName: booking.show.screen.theatre.name,
    screenName: booking.show.screen.name,
    showStartTime: booking.show.startTime.toISOString(),
    seats: booking.seatsSnapshot as unknown as BookingDTO["seats"],
    totalAmount: booking.totalAmount,
    couponCode: booking.couponCode,
    discountAmount: booking.discountAmount,
    foodItems: booking.foodItems.map((f) => ({ name: f.name, price: f.price, quantity: f.quantity })),
    foodTotal: booking.foodTotal,
    walletAmountUsed: booking.walletAmountUsed,
    donationAmount: booking.donationAmount,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    createdAt: booking.createdAt.toISOString(),
  };
}

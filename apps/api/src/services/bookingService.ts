import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/ApiError";
import { generateBookingReference } from "../utils/bookingRef";
import { checkHoldsOwnedBy, releaseHolds } from "./seatHoldService";
import { sendBookingTicketEmail } from "./emailService";
import { isStripeConfigured, verifyPaymentIntent } from "./paymentService";
import { emitSeatBooked, emitSeatReleased, emitBookingConfirmed } from "../lib/socket";
import type { BookingDTO, BookingSeatDTO, ConfirmBookingInput } from "@showtime/shared";

// Shared by confirmBooking() and the create-payment-intent endpoint —
// both need "what does this cart of seats cost, on this show, right
// now" before they do anything else (starting a charge, or starting the
// booking transaction). Kept as one function so the two can never
// silently disagree on price.
export async function computeSeatsPricing(showId: string, seatIds: string[]) {
  const show = await prisma.show.findUnique({
    where: { id: showId },
    include: { prices: true, movie: true, screen: { include: { theatre: true } } },
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
  const { showId, seatIds, guestDetails, simulatePaymentFailure, paymentIntentId } = input;

  // A booking belongs to EITHER a logged-in user OR a guest, never both,
  // never neither. userId comes from the auth cookie (server-trusted);
  // guestDetails comes from the request body and is only used when there
  // is no authenticated user.
  const isGuest = !ctx.userId;
  if (isGuest && !guestDetails) {
    throw ApiError.badRequest("Guest details are required when not logged in");
  }

  const { show, seatsSnapshot, totalAmount } = await computeSeatsPricing(showId, seatIds);

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
  // Two modes, chosen by whether STRIPE_SECRET_KEY is configured (see
  // paymentService.ts) — never both, and switching between them requires
  // no change anywhere else in this function or the transaction below,
  // since either way what leaves this block is just "payment is good,
  // proceed" or a thrown 402.
  if (isStripeConfigured()) {
    if (!paymentIntentId) throw ApiError.badRequest("paymentIntentId is required");
    // Re-fetches the PaymentIntent from Stripe itself rather than
    // trusting the client's word that payment succeeded, and checks its
    // amount/seats/session match this exact attempt (see
    // paymentService.ts's verifyPaymentIntent for why).
    await verifyPaymentIntent(paymentIntentId, {
      showId,
      seatIds,
      sessionId: ctx.sessionId,
      amountRupees: totalAmount,
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
          seatsSnapshot: seatsSnapshot as unknown as Prisma.InputJsonValue,
          paymentIntentId: paymentIntentId ?? null,
        },
      });

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
    movieTitle: show.movie.title,
    theatreName: show.screen.theatre.name,
    screenName: show.screen.name,
    showStartTime: show.startTime.toISOString(),
    seats: seatsSnapshot,
    totalAmount,
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

  // Deleting the BookingSeat rows is what frees the seats — see the
  // comment on the BookingSeat model in schema.prisma for why this
  // (rather than a status column + partial index) is the seat-release
  // mechanism. The Booking row itself, with its immutable seatsSnapshot,
  // is kept as CANCELLED for history.
  await prisma.$transaction([
    prisma.bookingSeat.deleteMany({ where: { bookingId } }),
    prisma.booking.update({ where: { id: bookingId }, data: { status: "CANCELLED" } }),
  ]);

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
  seatsSnapshot: Prisma.JsonValue;
  guestName: string | null;
  guestEmail: string | null;
  createdAt: Date;
  show: { startTime: Date; movie: { title: string }; screen: { name: string; theatre: { name: string } } };
}): BookingDTO {
  return {
    id: booking.id,
    reference: booking.reference,
    status: booking.status as BookingDTO["status"],
    showId: booking.showId,
    movieTitle: booking.show.movie.title,
    theatreName: booking.show.screen.theatre.name,
    screenName: booking.show.screen.name,
    showStartTime: booking.show.startTime.toISOString(),
    seats: booking.seatsSnapshot as unknown as BookingDTO["seats"],
    totalAmount: booking.totalAmount,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    createdAt: booking.createdAt.toISOString(),
  };
}

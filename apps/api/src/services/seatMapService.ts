import { prisma } from "../lib/prisma";
import { getHoldsForShow, getHoldTtl } from "./seatHoldService";
import { ApiError } from "../utils/ApiError";
import type { SeatCategory, SeatMapEntryDTO, SeatMapResponseDTO } from "@showtime/shared";

export async function buildSeatMap(showId: string, sessionId: string): Promise<SeatMapResponseDTO> {
  const show = await prisma.show.findUnique({
    where: { id: showId },
    include: {
      movie: true,
      prices: true,
      screen: { include: { theatre: true, seatLayout: { include: { seats: true } } } },
    },
  });
  if (!show || !show.screen.seatLayout) throw ApiError.notFound("Show not found");

  const seats = show.screen.seatLayout.seats;
  const seatIds = seats.map((s) => s.id);

  const [bookedSeats, holds] = await Promise.all([
    prisma.bookingSeat.findMany({ where: { showId }, select: { seatId: true } }),
    getHoldsForShow(showId, seatIds),
  ]);
  const bookedSet = new Set(bookedSeats.map((b) => b.seatId));

  const entries: SeatMapEntryDTO[] = await Promise.all(
    seats.map(async (seat) => {
      if (bookedSet.has(seat.id)) {
        return {
          id: seat.id,
          row: seat.row,
          col: seat.col,
          label: seat.label,
          category: seat.category,
          status: "BOOKED" as const,
          heldByMe: false,
          holdExpiresAt: null,
        };
      }
      const owner = holds.get(seat.id);
      if (owner) {
        const expiresAt = await getHoldTtl(showId, seat.id);
        return {
          id: seat.id,
          row: seat.row,
          col: seat.col,
          label: seat.label,
          category: seat.category,
          status: "HELD" as const,
          heldByMe: owner === sessionId,
          holdExpiresAt: expiresAt ? expiresAt.toISOString() : null,
        };
      }
      return {
        id: seat.id,
        row: seat.row,
        col: seat.col,
        label: seat.label,
        category: seat.category,
        status: "AVAILABLE" as const,
        heldByMe: false,
        holdExpiresAt: null,
      };
    }),
  );

  return {
    seats: entries,
    show: {
      id: show.id,
      movieTitle: show.movie.title,
      theatreName: show.screen.theatre.name,
      screenName: show.screen.name,
      startTime: show.startTime.toISOString(),
      prices: Object.fromEntries(show.prices.map((p) => [p.category, p.price])) as Record<
        SeatCategory,
        number
      >,
    },
  };
}

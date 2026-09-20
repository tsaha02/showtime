import { Router } from "express";
import { requireAdminAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { prisma } from "../../lib/prisma";

const router = Router();
router.use(requireAdminAuth);

// A single overview endpoint rather than one-per-widget: the admin
// dashboard renders all of these together, and the whole thing is one
// bounded query over a date-windowed set of bookings (this project's
// scale never justifies a data warehouse — everything here is computed
// by reducing over the relevant rows in memory, which is simpler and
// just as correct at this size).
router.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const [confirmedBookings, statusGroups] = await Promise.all([
      prisma.booking.findMany({
        where: { status: "CONFIRMED", createdAt: { gte: since } },
        include: {
          show: { include: { movie: true, event: true, screen: { include: { theatre: true } } } },
        },
      }),
      prisma.booking.groupBy({
        by: ["status"],
        where: { createdAt: { gte: since } },
        _count: { status: true },
      }),
    ]);

    let totalRevenue = 0;
    let totalSeatsSold = 0;
    const revenueByDayMap = new Map<string, number>();
    const movieStats = new Map<string, { title: string; revenue: number; bookings: number }>();
    const eventStats = new Map<string, { title: string; revenue: number; bookings: number }>();
    const cityStats = new Map<string, number>();

    for (const b of confirmedBookings) {
      const net = b.totalAmount - b.discountAmount + b.foodTotal;
      totalRevenue += net;
      const seats = Array.isArray(b.seatsSnapshot) ? b.seatsSnapshot.length : 0;
      totalSeatsSold += seats;

      const day = b.createdAt.toISOString().slice(0, 10);
      revenueByDayMap.set(day, (revenueByDayMap.get(day) ?? 0) + net);

      // `Show.movieId`/`.eventId` are mutually exclusive (see the
      // schema's `kind` discriminant) — bucket into whichever stats map
      // actually applies to this booking.
      if (b.show.movieId && b.show.movie) {
        const movie = movieStats.get(b.show.movieId) ?? { title: b.show.movie.title, revenue: 0, bookings: 0 };
        movie.revenue += net;
        movie.bookings += 1;
        movieStats.set(b.show.movieId, movie);
      } else if (b.show.eventId && b.show.event) {
        const event = eventStats.get(b.show.eventId) ?? { title: b.show.event.title, revenue: 0, bookings: 0 };
        event.revenue += net;
        event.bookings += 1;
        eventStats.set(b.show.eventId, event);
      }

      const city = b.show.screen.theatre.city;
      cityStats.set(city, (cityStats.get(city) ?? 0) + 1);
    }

    const revenueByDay = [...revenueByDayMap.entries()]
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const topMovies = [...movieStats.entries()]
      .map(([movieId, v]) => ({ movieId, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const topEvents = [...eventStats.entries()]
      .map(([eventId, v]) => ({ eventId, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const bookingsByCity = [...cityStats.entries()]
      .map(([city, bookings]) => ({ city, bookings }))
      .sort((a, b) => b.bookings - a.bookings);

    const bookingsByStatus = Object.fromEntries(statusGroups.map((g) => [g.status, g._count.status]));

    res.json({
      windowDays: days,
      totalRevenue,
      totalBookings: confirmedBookings.length,
      totalSeatsSold,
      bookingsByStatus,
      revenueByDay,
      topMovies,
      topEvents,
      bookingsByCity,
    });
  }),
);

export default router;

import { Router } from "express";
import { z } from "zod";
import type { SeatCategory } from "@prisma/client";
import { showSchema } from "@showtime/shared";
import { validateBody } from "../../middleware/validate";
import { requireAdminAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { prisma } from "../../lib/prisma";
import { DEFAULT_SEAT_PRICES } from "../../config/defaultPrices";

const router = Router();
router.use(requireAdminAuth);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const shows = await prisma.show.findMany({
      include: { movie: true, screen: { include: { theatre: true } }, prices: true },
      orderBy: { startTime: "desc" },
    });
    res.json({ shows });
  }),
);

router.post(
  "/",
  validateBody(showSchema),
  asyncHandler(async (req, res) => {
    const { movieId, screenId, startTime, prices } = req.body;
    const movie = await prisma.movie.findUnique({ where: { id: movieId } });
    if (!movie) throw ApiError.badRequest("Movie not found");

    const start = new Date(startTime);
    const end = new Date(start.getTime() + movie.durationMins * 60_000);

    const show = await prisma.show.create({
      data: {
        movieId,
        screenId,
        startTime: start,
        endTime: end,
        prices: { createMany: { data: prices } },
      },
      include: { prices: true },
    });
    res.status(201).json({ show });
  }),
);

const autoScheduleSchema = z.object({
  movieIds: z.array(z.string().uuid()).min(1),
  // Optional: only schedule onto screens whose theatre is in this city —
  // useful right after importing a batch of real theatres for one city
  // via /admin/theatre-discovery, so the new movies land specifically on
  // the screens that just showed up with nothing playing. Omit to target
  // every screen in the system.
  city: z.string().optional(),
});

// Fast admin tooling, NOT a live feed of any kind — there is no free
// source for real showtime data (see the comment on the `Show` model in
// schema.prisma), so this can only ever distribute a set of movies an
// admin already picked across screens. It exists specifically to make
// populating a large, real-theatre-backed schedule (e.g. after importing
// several real theatres via /admin/theatre-discovery) fast, instead of
// manually creating one Show at a time for dozens of screens.
//
// This ALWAYS adds a new show per targeted screen — it does not skip a
// screen just because it already has an upcoming show. A real theatre
// legitimately runs several shows a day on the same screen; gating this
// on "screen has zero upcoming shows" (an earlier version of this route)
// meant the button silently did nothing at all once every screen already
// had one show scheduled — exactly the "nothing is working" bug this
// fixes. Running this repeatedly is expected to keep adding shows, same
// as clicking "create show" manually would.
router.post(
  "/auto-schedule",
  validateBody(autoScheduleSchema),
  asyncHandler(async (req, res) => {
    const movies = await prisma.movie.findMany({ where: { id: { in: req.body.movieIds } } });
    if (movies.length === 0) throw ApiError.badRequest("No valid movies provided");

    const targetScreens = await prisma.screen.findMany({
      where: req.body.city ? { theatre: { city: req.body.city } } : undefined,
    });
    if (targetScreens.length === 0) {
      throw ApiError.badRequest(
        req.body.city ? `No screens found for city "${req.body.city}"` : "No screens exist to schedule onto",
      );
    }

    const now = new Date();
    const priceData = (Object.keys(DEFAULT_SEAT_PRICES) as SeatCategory[]).map((category) => ({
      category,
      price: DEFAULT_SEAT_PRICES[category],
    }));

    let movieCursor = 0;
    let hourCursor = 3;
    let scheduledCount = 0;
    for (const screen of targetScreens) {
      const movie = movies[movieCursor % movies.length];
      movieCursor++;
      hourCursor += 4; // spreads shows across the next several days, staggered by screen
      const startTime = new Date(now.getTime() + hourCursor * 60 * 60 * 1000);
      const endTime = new Date(startTime.getTime() + movie.durationMins * 60_000);

      await prisma.show.create({
        data: {
          movieId: movie.id,
          screenId: screen.id,
          startTime,
          endTime,
          prices: { createMany: { data: priceData } },
        },
      });
      scheduledCount++;
    }

    res.json({ scheduledCount, screensConsidered: targetScreens.length });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.show.delete({ where: { id: req.params.id } }).catch(() => {
      throw ApiError.notFound("Show not found");
    });
    res.status(204).send();
  }),
);

export default router;

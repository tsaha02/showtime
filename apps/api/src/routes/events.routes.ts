import { Router } from "express";
import type { Prisma, EventCategory } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { toEventDTO } from "../services/eventService";
import type { ShowDTO } from "@showtime/shared";

const router = Router();

// Mirrors `GET /api/movies` — `bookable=true` narrows to events with an
// upcoming session somewhere, same "don't link to something you can't
// actually buy" reasoning as the movie catalog.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const city = typeof req.query.city === "string" ? req.query.city : undefined;
    const bookable = req.query.bookable === "true";

    const where: Prisma.EventWhereInput = {};
    if (search) where.title = { contains: search, mode: "insensitive" };
    if (category) where.category = category as EventCategory;

    if (bookable || city) {
      where.shows = {
        some: {
          ...(bookable ? { startTime: { gte: new Date() } } : {}),
          ...(city ? { screen: { theatre: { city } } } : {}),
        },
      };
    }

    const events = await prisma.event.findMany({ where, orderBy: { createdAt: "desc" } });
    res.json({ events: events.map(toEventDTO) });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const event = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!event) throw ApiError.notFound("Event not found");
    res.json({ event: toEventDTO(event) });
  }),
);

// Mirrors `GET /api/movies/:id/shows` exactly — same optional
// `?city=`/`?format=`/`?language=` narrowing, same response shape
// (`ShowDTO`), just sourced from `eventId` instead of `movieId`.
router.get(
  "/:id/sessions",
  asyncHandler(async (req, res) => {
    const city = typeof req.query.city === "string" ? req.query.city : undefined;
    const format = typeof req.query.format === "string" ? req.query.format : undefined;
    const language = typeof req.query.language === "string" ? req.query.language : undefined;

    const shows = await prisma.show.findMany({
      where: {
        eventId: req.params.id,
        startTime: { gte: new Date() },
        ...(city ? { screen: { theatre: { city } } } : {}),
        ...(format ? { format } : {}),
        ...(language ? { language } : {}),
      },
      include: { screen: { include: { theatre: true } }, prices: true },
      orderBy: { startTime: "asc" },
    });

    const sessions: ShowDTO[] = shows.map((show) => ({
      id: show.id,
      kind: "EVENT",
      movieId: null,
      eventId: show.eventId,
      screenId: show.screenId,
      startTime: show.startTime.toISOString(),
      endTime: show.endTime.toISOString(),
      screenName: show.screen.name,
      theatreName: show.screen.theatre.name,
      theatreCity: show.screen.theatre.city,
      format: show.format,
      language: show.language,
      prices: Object.fromEntries(show.prices.map((p) => [p.category, p.price])) as ShowDTO["prices"],
    }));

    res.json({ sessions });
  }),
);

export default router;

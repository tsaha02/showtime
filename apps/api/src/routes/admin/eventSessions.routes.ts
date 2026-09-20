import { Router } from "express";
import { eventSessionSchema } from "@showtime/shared";
import { validateBody } from "../../middleware/validate";
import { requireAdminAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { prisma } from "../../lib/prisma";

const router = Router();
router.use(requireAdminAuth);

// Mirrors admin/shows.routes.ts's create/list/delete exactly (`kind:
// "EVENT"`, `eventId` instead of `movieId`) — see the `Show` model
// comment for why this is the same table, not a parallel one. No
// auto-schedule equivalent here: unlike a movie (which genuinely runs
// on many screens at once), scheduling one event session at a time is
// the realistic admin workflow, so there's no bulk-distribute action to
// mirror.
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const sessions = await prisma.show.findMany({
      where: { kind: "EVENT" },
      include: { event: true, screen: { include: { theatre: true } }, prices: true },
      orderBy: { startTime: "desc" },
    });
    res.json({ sessions });
  }),
);

router.post(
  "/",
  validateBody(eventSessionSchema),
  asyncHandler(async (req, res) => {
    const { eventId, screenId, startTime, format, language, prices } = req.body;
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw ApiError.badRequest("Event not found");

    const start = new Date(startTime);
    const end = new Date(start.getTime() + event.durationMins * 60_000);

    const session = await prisma.show.create({
      data: {
        kind: "EVENT",
        eventId,
        screenId,
        startTime: start,
        endTime: end,
        format,
        language,
        prices: { createMany: { data: prices } },
      },
      include: { prices: true },
    });

    res.status(201).json({ session });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.show.delete({ where: { id: req.params.id, kind: "EVENT" } }).catch(() => {
      throw ApiError.notFound("Event session not found");
    });
    res.status(204).send();
  }),
);

export default router;

import { Router } from "express";
import { eventSchema } from "@showtime/shared";
import { validateBody } from "../../middleware/validate";
import { requireAdminAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { prisma } from "../../lib/prisma";
import { toEventDTO } from "../../services/eventService";

const router = Router();
router.use(requireAdminAuth);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const events = await prisma.event.findMany({ orderBy: { createdAt: "desc" } });
    res.json({ events: events.map(toEventDTO) });
  }),
);

router.post(
  "/",
  validateBody(eventSchema),
  asyncHandler(async (req, res) => {
    const event = await prisma.event.create({ data: req.body });
    res.status(201).json({ event: toEventDTO(event) });
  }),
);

router.put(
  "/:id",
  validateBody(eventSchema),
  asyncHandler(async (req, res) => {
    const event = await prisma.event
      .update({ where: { id: req.params.id }, data: req.body })
      .catch(() => null);
    if (!event) throw ApiError.notFound("Event not found");
    res.json({ event: toEventDTO(event) });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.event.delete({ where: { id: req.params.id } }).catch(() => {
      throw ApiError.notFound("Event not found");
    });
    res.status(204).send();
  }),
);

export default router;

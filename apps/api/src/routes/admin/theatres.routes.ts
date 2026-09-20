import { Router } from "express";
import { theatreSchema, screenSchema } from "@showtime/shared";
import { validateBody } from "../../middleware/validate";
import { requireAdminAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { prisma } from "../../lib/prisma";

const router = Router();
router.use(requireAdminAuth);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const theatres = await prisma.theatre.findMany({
      include: { screens: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ theatres });
  }),
);

router.post(
  "/",
  validateBody(theatreSchema),
  asyncHandler(async (req, res) => {
    const theatre = await prisma.theatre.create({ data: req.body });
    res.status(201).json({ theatre });
  }),
);

router.put(
  "/:id",
  validateBody(theatreSchema),
  asyncHandler(async (req, res) => {
    const theatre = await prisma.theatre
      .update({ where: { id: req.params.id }, data: req.body })
      .catch(() => null);
    if (!theatre) throw ApiError.notFound("Theatre not found");
    res.json({ theatre });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.theatre.delete({ where: { id: req.params.id } }).catch(() => {
      throw ApiError.notFound("Theatre not found");
    });
    res.status(204).send();
  }),
);

// --- Screens (nested under theatres) ---

router.post(
  "/:theatreId/screens",
  asyncHandler(async (req, res) => {
    const result = screenSchema.safeParse({ ...req.body, theatreId: req.params.theatreId });
    if (!result.success) throw ApiError.badRequest("Validation failed", result.error.flatten());
    const screen = await prisma.screen.create({ data: result.data });
    res.status(201).json({ screen });
  }),
);

router.delete(
  "/:theatreId/screens/:screenId",
  asyncHandler(async (req, res) => {
    await prisma.screen.delete({ where: { id: req.params.screenId } }).catch(() => {
      throw ApiError.notFound("Screen not found");
    });
    res.status(204).send();
  }),
);

export default router;

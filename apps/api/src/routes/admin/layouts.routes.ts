import { Router } from "express";
import { seatLayoutSchema } from "@showtime/shared";
import { validateBody } from "../../middleware/validate";
import { requireAdminAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { prisma } from "../../lib/prisma";

const router = Router();
router.use(requireAdminAuth);

router.get(
  "/:screenId",
  asyncHandler(async (req, res) => {
    const layout = await prisma.seatLayout.findUnique({
      where: { screenId: req.params.screenId },
      include: { seats: true },
    });
    res.json({ layout });
  }),
);

// Create-or-replace: defining a layout wipes any existing seats for this
// screen and inserts the new set. Simpler to reason about than a diffing
// update, and acceptable here since a screen's physical layout changes
// rarely and never while a show against it has active bookings in this
// demo dataset (a production admin tool would block this once a Show
// referencing the screen has bookings).
router.put(
  "/:screenId",
  validateBody(seatLayoutSchema.omit({ screenId: true })),
  asyncHandler(async (req, res) => {
    const { screenId } = req.params;
    const screen = await prisma.screen.findUnique({ where: { id: screenId } });
    if (!screen) throw ApiError.notFound("Screen not found");

    const layout = await prisma.$transaction(async (tx) => {
      const existing = await tx.seatLayout.findUnique({ where: { screenId } });
      const layoutId = existing?.id ?? (await tx.seatLayout.create({ data: { screenId } })).id;
      await tx.seat.deleteMany({ where: { layoutId } });
      await tx.seat.createMany({
        data: req.body.seats.map(
          (s: { row: number; col: number; label: string; category: string; wheelchairAccessible?: boolean }) => ({
            layoutId,
            ...s,
          }),
        ),
      });
      return tx.seatLayout.findUnique({ where: { id: layoutId }, include: { seats: true } });
    });

    res.json({ layout });
  }),
);

export default router;

import { Router } from "express";
import { holdSeatSchema, releaseSeatSchema } from "@showtime/shared";
import { validateBody } from "../middleware/validate";
import { requireSessionId } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { prisma } from "../lib/prisma";
import { acquireHold, releaseHold } from "../services/seatHoldService";
import { emitSeatHeld, emitSeatReleased } from "../lib/socket";

const router = Router();

router.post(
  "/hold",
  requireSessionId,
  validateBody(holdSeatSchema),
  asyncHandler(async (req, res) => {
    const { showId, seatId } = req.body;

    const [show, seat, alreadyBooked] = await Promise.all([
      prisma.show.findUnique({ where: { id: showId } }),
      prisma.seat.findUnique({ where: { id: seatId } }),
      prisma.bookingSeat.findUnique({ where: { showId_seatId: { showId, seatId } } }),
    ]);
    if (!show || !seat) throw ApiError.notFound("Show or seat not found");
    if (alreadyBooked) throw ApiError.conflict("This seat is already booked");

    const result = await acquireHold(showId, seatId, req.sessionId);
    if (!result.ok) {
      throw ApiError.conflict("Someone else is holding this seat right now");
    }

    emitSeatHeld({ showId, seatId, holdExpiresAt: result.expiresAt.toISOString() });
    res.json({ holdExpiresAt: result.expiresAt.toISOString() });
  }),
);

router.post(
  "/release",
  requireSessionId,
  validateBody(releaseSeatSchema),
  asyncHandler(async (req, res) => {
    const { showId, seatId } = req.body;
    const released = await releaseHold(showId, seatId, req.sessionId);
    if (released) emitSeatReleased({ showId, seatId });
    res.status(204).send();
  }),
);

export default router;

import { Router } from "express";
import { requireAdminAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { prisma } from "../../lib/prisma";
import { bookingToDTO } from "../../services/bookingService";
import type { Prisma } from "@prisma/client";

const router = Router();
router.use(requireAdminAuth);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { reference, email, showId } = req.query as Record<string, string | undefined>;

    const where: Prisma.BookingWhereInput = {};
    if (reference) where.reference = { contains: reference, mode: "insensitive" };
    if (email) {
      where.OR = [
        { guestEmail: { contains: email, mode: "insensitive" } },
        { user: { email: { contains: email, mode: "insensitive" } } },
      ];
    }
    if (showId) where.showId = showId;

    const bookings = await prisma.booking.findMany({
      where,
      include: {
        show: { include: { movie: true, event: true, screen: { include: { theatre: true } } } },
        user: true,
        foodItems: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    res.json({
      bookings: bookings.map((b) => ({
        ...bookingToDTO(b),
        userEmail: b.user?.email ?? null,
      })),
    });
  }),
);

export default router;

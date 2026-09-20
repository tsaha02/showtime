import { Router } from "express";
import { createRatingSchema } from "@showtime/shared";
import { validateBody } from "../middleware/validate";
import { requireCustomerAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { prisma } from "../lib/prisma";

const router = Router();

router.post(
  "/",
  requireCustomerAuth,
  validateBody(createRatingSchema),
  asyncHandler(async (req, res) => {
    const { movieId, stars, comment } = req.body;
    const userId = req.user!.id;

    // Eligibility, enforced server-side (not just hidden in the UI):
    // the user must hold a CONFIRMED booking for a Show of this movie,
    // and that show must already have ended. Guests can never reach this
    // route at all since requireCustomerAuth rejects unauthenticated
    // requests before we even get here — rating requires an account by
    // construction, not just by convention.
    const eligible = await prisma.booking.findFirst({
      where: {
        userId,
        status: "CONFIRMED",
        show: { movieId, endTime: { lt: new Date() } },
      },
    });
    if (!eligible) {
      throw ApiError.forbidden(
        "You can only rate a movie after a confirmed booking for a show that has ended",
      );
    }

    const rating = await prisma.rating.upsert({
      where: { movieId_userId: { movieId, userId } },
      create: { movieId, userId, stars, comment },
      update: { stars, comment },
      include: { user: true },
    });

    res.status(201).json({
      rating: {
        id: rating.id,
        movieId: rating.movieId,
        userId: rating.userId,
        userName: rating.user.name,
        stars: rating.stars,
        comment: rating.comment,
        createdAt: rating.createdAt.toISOString(),
      },
    });
  }),
);

export default router;

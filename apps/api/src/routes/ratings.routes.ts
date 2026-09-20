import { Router } from "express";
import { createRatingSchema, voteRatingSchema } from "@showtime/shared";
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
    const { movieId, stars, comment, isSpoiler } = req.body;
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
      create: { movieId, userId, stars, comment, isSpoiler: isSpoiler ?? false },
      update: { stars, comment, isSpoiler: isSpoiler ?? false },
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
        isSpoiler: rating.isSpoiler,
        helpfulCount: 0,
        notHelpfulCount: 0,
        myVote: null,
        createdAt: rating.createdAt.toISOString(),
      },
    });
  }),
);

// Upsert semantics — casting a new vote overwrites the viewer's previous
// one on this same rating rather than stacking votes, and voting again
// with the same value is a no-op via the same upsert.
router.post(
  "/:id/vote",
  requireCustomerAuth,
  validateBody(voteRatingSchema),
  asyncHandler(async (req, res) => {
    const ratingId = req.params.id;
    const userId = req.user!.id;

    const rating = await prisma.rating.findUnique({ where: { id: ratingId } });
    if (!rating) throw ApiError.notFound("Rating not found");
    if (rating.userId === userId) throw ApiError.badRequest("You cannot vote on your own review");

    await prisma.ratingVote.upsert({
      where: { ratingId_userId: { ratingId, userId } },
      create: { ratingId, userId, helpful: req.body.helpful },
      update: { helpful: req.body.helpful },
    });

    const [helpfulCount, notHelpfulCount] = await Promise.all([
      prisma.ratingVote.count({ where: { ratingId, helpful: true } }),
      prisma.ratingVote.count({ where: { ratingId, helpful: false } }),
    ]);

    res.json({ helpfulCount, notHelpfulCount, myVote: req.body.helpful });
  }),
);

export default router;

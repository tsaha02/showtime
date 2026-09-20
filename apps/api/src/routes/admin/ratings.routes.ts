import { Router } from "express";
import { requireAdminAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { prisma } from "../../lib/prisma";

const router = Router();
router.use(requireAdminAuth);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const ratings = await prisma.rating.findMany({
      include: { user: true, movie: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({
      ratings: ratings.map((r) => ({
        id: r.id,
        movieId: r.movieId,
        movieTitle: r.movie.title,
        userId: r.userId,
        userName: r.user.name,
        stars: r.stars,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.rating.delete({ where: { id: req.params.id } }).catch(() => {
      throw ApiError.notFound("Rating not found");
    });
    res.status(204).send();
  }),
);

export default router;

import { Router } from "express";
import { movieSchema } from "@showtime/shared";
import { validateBody } from "../../middleware/validate";
import { requireAdminAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { prisma } from "../../lib/prisma";
import { toMovieDTO } from "../../services/movieService";

const router = Router();
router.use(requireAdminAuth);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const movies = await prisma.movie.findMany({ orderBy: { createdAt: "desc" } });
    res.json({ movies: await Promise.all(movies.map(toMovieDTO)) });
  }),
);

router.post(
  "/",
  validateBody(movieSchema),
  asyncHandler(async (req, res) => {
    const movie = await prisma.movie.create({
      data: { ...req.body, releaseDate: new Date(req.body.releaseDate) },
    });
    res.status(201).json({ movie: await toMovieDTO(movie) });
  }),
);

router.put(
  "/:id",
  validateBody(movieSchema),
  asyncHandler(async (req, res) => {
    const movie = await prisma.movie
      .update({
        where: { id: req.params.id },
        data: { ...req.body, releaseDate: new Date(req.body.releaseDate) },
      })
      .catch(() => null);
    if (!movie) throw ApiError.notFound("Movie not found");
    res.json({ movie: await toMovieDTO(movie) });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.movie.delete({ where: { id: req.params.id } }).catch(() => {
      throw ApiError.notFound("Movie not found");
    });
    res.status(204).send();
  }),
);

export default router;

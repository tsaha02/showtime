import { prisma } from "../lib/prisma";
import type { MovieDTO } from "@showtime/shared";
import type { ExternalMovieDetails } from "./externalMovieService";

// Shared by the single-title admin import (externalMovies.routes.ts
// POST /import) and the bulk import (POST /bulk-import) — both are "take
// whatever the external source returned and make it a local Movie row,"
// they only differ in how they arrive at `details`.
export async function upsertMovieFromExternalDetails(details: ExternalMovieDetails) {
  return prisma.movie.upsert({
    where: { externalId: details.externalId },
    create: {
      title: details.title,
      description: details.overview || "No description available.",
      // The external source sometimes lacks a runtime/plot (e.g. very
      // new or obscure titles); 120 is a reasonable placeholder an
      // admin can correct via the regular edit form once known.
      durationMins: details.durationMins ?? 120,
      genre: details.genre,
      posterUrl: details.posterUrl,
      releaseDate: details.releaseDate ? new Date(details.releaseDate) : new Date(),
      externalId: details.externalId,
    },
    update: {
      title: details.title,
      description: details.overview || "No description available.",
      durationMins: details.durationMins ?? 120,
      genre: details.genre,
      posterUrl: details.posterUrl,
      releaseDate: details.releaseDate ? new Date(details.releaseDate) : new Date(),
    },
  });
}

// Average rating is computed ON READ via a Prisma aggregate, rather than
// denormalized onto Movie and recomputed on every rating write. At this
// project's scale (a handful of movies, dozens of ratings) an aggregate
// query per listing request is trivial, and it guarantees the number
// shown is always exactly correct — there's no stored value that can
// drift out of sync with the underlying Rating rows. A production system
// with heavy read traffic would flip this: recompute-and-store on write
// (or via a periodic job), trading a small write-time cost for O(1) reads.
export async function toMovieDTO(movie: {
  id: string;
  title: string;
  description: string;
  durationMins: number;
  genre: string;
  posterUrl: string | null;
  releaseDate: Date;
  externalId: string | null;
  createdAt: Date;
}): Promise<MovieDTO> {
  const agg = await prisma.rating.aggregate({
    where: { movieId: movie.id },
    _avg: { stars: true },
    _count: { stars: true },
  });

  return {
    id: movie.id,
    title: movie.title,
    description: movie.description,
    durationMins: movie.durationMins,
    genre: movie.genre,
    posterUrl: movie.posterUrl,
    releaseDate: movie.releaseDate.toISOString(),
    averageRating: agg._avg.stars ? Math.round(agg._avg.stars * 10) / 10 : 0,
    ratingCount: agg._count.stars,
    externalId: movie.externalId,
    createdAt: movie.createdAt.toISOString(),
  };
}

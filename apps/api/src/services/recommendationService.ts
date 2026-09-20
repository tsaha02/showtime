import { prisma } from "../lib/prisma";
import { toMovieDTO } from "./movieService";
import type { MovieDTO } from "@showtime/shared";

// Deliberately simple and explainable — no ML model, no embeddings,
// just "shares a genre token with something you'd book/have booked."
// `genre` is a free-text, comma-separated field (see movies.routes.ts's
// comment on why), so similarity is computed by splitting both sides on
// commas and counting overlapping tokens — honest about what this is:
// a real, useful recommendation, not a dressed-up random shuffle, but
// not a claim of a trained model either.
function genreTokens(genre: string): string[] {
  return genre.split(",").map((g) => g.trim().toLowerCase()).filter(Boolean);
}

function scoreOverlap(a: string[], b: string[]): number {
  const bSet = new Set(b);
  return a.filter((g) => bSet.has(g)).length;
}

async function bookableMovies() {
  return prisma.movie.findMany({
    where: { shows: { some: { startTime: { gte: new Date() } } } },
    orderBy: { releaseDate: "desc" },
  });
}

// "You might also like" on a movie's own detail page — other bookable
// movies sharing at least one genre, ranked by how many genres overlap,
// ties broken by recency.
export async function getSimilarMovies(movieId: string, limit = 6): Promise<MovieDTO[]> {
  const target = await prisma.movie.findUnique({ where: { id: movieId } });
  if (!target) return [];

  const candidates = (await bookableMovies()).filter((m) => m.id !== movieId);
  const targetGenres = genreTokens(target.genre);

  const ranked = candidates
    .map((m) => ({ movie: m, score: scoreOverlap(targetGenres, genreTokens(m.genre)) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.movie);

  return Promise.all(ranked.map(toMovieDTO));
}

// "Because you booked ___" — personalized picks for a logged-in user,
// based on the genres of movies they've actually confirmed a booking
// for. Falls back to the newest bookable releases for a user with no
// booking history yet, rather than returning nothing.
export async function getPersonalizedRecommendations(userId: string, limit = 8): Promise<MovieDTO[]> {
  // Movie-only for now — an Event booking has no `genre` to reason
  // about, so it's simply excluded from this signal rather than
  // crashing or counting as a bizarre "no genre" preference.
  const pastBookings = await prisma.booking.findMany({
    where: { userId, status: "CONFIRMED", show: { kind: "MOVIE" } },
    select: { show: { select: { movieId: true, movie: { select: { genre: true } } } } },
  });

  const bookedMovieIds = new Set(pastBookings.map((b) => b.show.movieId));
  const likedGenres = new Set(pastBookings.flatMap((b) => genreTokens(b.show.movie!.genre)));

  const candidates = (await bookableMovies()).filter((m) => !bookedMovieIds.has(m.id));

  if (likedGenres.size === 0) {
    return Promise.all(candidates.slice(0, limit).map(toMovieDTO));
  }

  const ranked = candidates
    .map((m) => ({ movie: m, score: scoreOverlap(genreTokens(m.genre), [...likedGenres]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.movie);

  return Promise.all(ranked.map(toMovieDTO));
}

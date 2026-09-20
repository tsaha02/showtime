import { Router } from "express";
import rateLimit from "express-rate-limit";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { optionalCustomerAuth } from "../middleware/auth";
import { toMovieDTO } from "../services/movieService";
import { getSimilarMovies, getPersonalizedRecommendations } from "../services/recommendationService";
import { searchExternalMovies, getExternalMovieDetails, getExternalMovieByTitle } from "../services/externalMovieService";
import { CURATED_MOVIE_TITLES } from "../data/curatedMovieTitles";

const router = Router();

// Public (no auth) but rate-limited: unlike the admin import endpoints,
// these are reachable by any visitor and consume this server's shared
// OMDb quota (1,000 requests/day on the free tier) — a generous but
// bounded per-IP limit keeps one visitor from being able to exhaust it
// for everyone else.
const discoverRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60 });

// Distinct genre/city lists for the frontend's filter dropdowns. Kept as
// two tiny endpoints rather than baking them into the movie/theatre list
// responses, since "what genres/cities currently exist" is a different
// question from "give me movies/theatres" and changes far less often.
//
// `Movie.genre` is a free-text string, not an enum — hand-entered movies
// might have one genre ("Action"), but real data imported from OMDb
// commonly has several ("Action, Adventure, Sci-Fi"). Splitting on comma
// here (rather than storing genre as an array/join table) keeps the
// schema simple while still giving the filter dropdown clean, individual
// genre options instead of a combinatorial explosion of exact multi-
// genre strings.
router.get(
  "/genres",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.movie.findMany({ select: { genre: true } });
    const genres = new Set<string>();
    for (const row of rows) {
      for (const g of row.genre.split(",")) {
        const trimmed = g.trim();
        if (trimmed) genres.add(trimmed);
      }
    }
    res.json({ genres: [...genres].sort() });
  }),
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const genre = typeof req.query.genre === "string" ? req.query.genre : undefined;
    const city = typeof req.query.city === "string" ? req.query.city : undefined;
    // "Now showing" semantics: only movies with an actual upcoming show
    // somewhere are "bookable". This endpoint defaults to showing
    // EVERYTHING in the local catalog (so admin tooling / the "browse
    // movies" experience can still see every Movie row, including ones
    // with no scheduled shows yet) — the customer home page passes
    // `bookable=true` explicitly to get the BookMyShow-style behavior of
    // "we only list what you can actually book," never a title you'd
    // click into just to find nothing to buy. See also
    // `/api/movies/discover` for browsing movies NOT in this catalog at
    // all (real OMDb data, no booking possible) — that's a deliberately
    // separate endpoint/page rather than mixed into this one, for
    // exactly this reason.
    const bookable = req.query.bookable === "true";

    const where: Prisma.MovieWhereInput = {};
    if (search) where.title = { contains: search, mode: "insensitive" };
    // Substring match, not equality: `genre` is a free-text field that
    // can hold several comma-separated values ("Action, Adventure,
    // Sci-Fi"), so selecting "Action" from the dropdown above needs to
    // match any movie whose genre string CONTAINS "Action", not just one
    // whose genre is EXACTLY "Action".
    if (genre) where.genre = { contains: genre, mode: "insensitive" };

    if (bookable || city) {
      where.shows = {
        some: {
          ...(bookable ? { startTime: { gte: new Date() } } : {}),
          ...(city ? { screen: { theatre: { city } } } : {}),
        },
      };
    }

    const movies = await prisma.movie.findMany({
      where,
      orderBy: { releaseDate: "desc" },
    });
    res.json({ movies: await Promise.all(movies.map(toMovieDTO)) });
  }),
);

// --- "Discover" — browsing ANY real movie via OMDb, separate from this
// app's own bookable catalog ---
//
// This is deliberately a different pair of endpoints from `GET /` above,
// not a mode/flag on it: `/` answers "what's in ShowTime's catalog"
// (optionally narrowed to `bookable=true`, i.e. "what can I actually buy
// a ticket for"); `/discover*` answers "what does a real movie database
// know about any title," independent of whether ShowTime has ever heard
// of it. Mixing these into one endpoint would make it easy to
// accidentally present a browsable-but-unbookable result as if it were
// a normal catalog entry — the two-page split (see apps/web's
// SearchMoviesPage vs HomePage) is what makes BookMyShow's actual
// behavior possible: browse anything, but only ever "book" a show that
// really exists.
router.get(
  "/discover",
  discoverRateLimit,
  asyncHandler(async (req, res) => {
    const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
    if (!query) throw ApiError.badRequest("Query parameter 'query' is required");
    const results = await searchExternalMovies(query);
    res.json({ results });
  }),
);

const TRENDING_CACHE_KEY = "movies:trending";
const TRENDING_CACHE_TTL_SECONDS = 60 * 60 * 6; // 6h — these are fixed, real titles, not truly live
const TRENDING_TITLES = CURATED_MOVIE_TITLES.slice(0, 12);

// Shown by default on the Search Movies page, before any query is typed,
// so that page never opens to a blank search box. OMDb has no "trending"
// concept of its own (see curatedMovieTitles.ts's module comment) — this
// resolves a small, fixed slice of the same curated real-title list the
// admin bulk-import uses, through OMDb, so what's shown is still 100%
// real movie data, just a fixed selection rather than a live "what's
// popular today" feed (which no free source can answer).
router.get(
  "/discover/trending",
  discoverRateLimit,
  asyncHandler(async (_req, res) => {
    const cached = await redis.get(TRENDING_CACHE_KEY);
    if (cached) {
      return res.json({ results: JSON.parse(cached) });
    }

    const resolved = await Promise.all(TRENDING_TITLES.map((title) => getExternalMovieByTitle(title)));
    const results = resolved.filter((r): r is NonNullable<typeof r> => r !== null);

    await redis.set(TRENDING_CACHE_KEY, JSON.stringify(results), "EX", TRENDING_CACHE_TTL_SECONDS);
    res.json({ results });
  }),
);

router.get(
  "/discover/:externalId",
  discoverRateLimit,
  asyncHandler(async (req, res) => {
    const details = await getExternalMovieDetails(req.params.externalId);

    // If this title has already been imported into ShowTime's own
    // catalog (by an admin) AND has an upcoming show, link straight to
    // the real booking flow; otherwise this is informational-only.
    const localMovie = await prisma.movie.findUnique({ where: { externalId: details.externalId } });
    let bookable = false;
    if (localMovie) {
      const upcomingShow = await prisma.show.findFirst({
        where: { movieId: localMovie.id, startTime: { gte: new Date() } },
        select: { id: true },
      });
      bookable = !!upcomingShow;
    }

    res.json({ details, localMovieId: localMovie?.id ?? null, bookable });
  }),
);

// Must be registered BEFORE `/:id` — otherwise Express would match this
// path as `/:id` with id="recommended".
router.get(
  "/recommended",
  optionalCustomerAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) return res.json({ movies: [] });
    const movies = await getPersonalizedRecommendations(req.user.id);
    res.json({ movies });
  }),
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const movie = await prisma.movie.findUnique({ where: { id: req.params.id } });
    if (!movie) throw ApiError.notFound("Movie not found");
    res.json({ movie: await toMovieDTO(movie) });
  }),
);

router.get(
  "/:id/similar",
  asyncHandler(async (req, res) => {
    res.json({ movies: await getSimilarMovies(req.params.id) });
  }),
);

router.get(
  "/:id/shows",
  asyncHandler(async (req, res) => {
    // Optional `?city=` narrows to shows at theatres in that city — this
    // is what lets the frontend carry a previously-selected city (e.g.
    // from the Home page's city filter) into a movie's detail page, so
    // "I picked Mumbai, then opened this movie" shows Mumbai's theatres
    // by default instead of every theatre in every city the movie plays
    // in. The frontend still lets a user switch to "all cities" by
    // simply re-requesting without this param.
    const city = typeof req.query.city === "string" ? req.query.city : undefined;
    const format = typeof req.query.format === "string" ? req.query.format : undefined;
    const language = typeof req.query.language === "string" ? req.query.language : undefined;

    const shows = await prisma.show.findMany({
      where: {
        movieId: req.params.id,
        startTime: { gte: new Date() },
        ...(city ? { screen: { theatre: { city } } } : {}),
        ...(format ? { format } : {}),
        ...(language ? { language } : {}),
      },
      include: { screen: { include: { theatre: true } }, prices: true },
      orderBy: { startTime: "asc" },
    });

    res.json({
      shows: shows.map((show) => ({
        id: show.id,
        kind: "MOVIE" as const,
        movieId: show.movieId,
        eventId: null,
        screenId: show.screenId,
        startTime: show.startTime.toISOString(),
        endTime: show.endTime.toISOString(),
        screenName: show.screen.name,
        theatreName: show.screen.theatre.name,
        theatreCity: show.screen.theatre.city,
        format: show.format,
        language: show.language,
        prices: Object.fromEntries(show.prices.map((p) => [p.category, p.price])),
      })),
    });
  }),
);

const RATINGS_PAGE_SIZE = 10;

router.get(
  "/:id/ratings",
  optionalCustomerAuth,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const viewerId = req.user?.id;

    const [ratings, total, starGroups] = await Promise.all([
      prisma.rating.findMany({
        where: { movieId: req.params.id },
        include: { user: true, votes: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * RATINGS_PAGE_SIZE,
        take: RATINGS_PAGE_SIZE,
      }),
      prisma.rating.count({ where: { movieId: req.params.id } }),
      prisma.rating.groupBy({ by: ["stars"], where: { movieId: req.params.id }, _count: { stars: true } }),
    ]);

    const starCounts: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const g of starGroups) starCounts[g.stars as 1 | 2 | 3 | 4 | 5] = g._count.stars;

    res.json({
      ratings: ratings.map((r) => ({
        id: r.id,
        movieId: r.movieId,
        userId: r.userId,
        userName: r.user.name,
        stars: r.stars,
        comment: r.comment,
        isSpoiler: r.isSpoiler,
        helpfulCount: r.votes.filter((v) => v.helpful).length,
        notHelpfulCount: r.votes.filter((v) => !v.helpful).length,
        myVote: viewerId ? (r.votes.find((v) => v.userId === viewerId)?.helpful ?? null) : undefined,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize: RATINGS_PAGE_SIZE,
      starCounts,
    });
  }),
);

export default router;

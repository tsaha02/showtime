import { Router } from "express";
import { importExternalMovieSchema } from "@showtime/shared";
import { validateBody } from "../../middleware/validate";
import { requireAdminAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import {
  searchExternalMovies,
  getExternalMovieDetails,
  getExternalMovieByTitle,
} from "../../services/externalMovieService";
import { toMovieDTO, upsertMovieFromExternalDetails } from "../../services/movieService";
import { CURATED_MOVIE_TITLES } from "../../data/curatedMovieTitles";

const router = Router();
router.use(requireAdminAuth);

router.get(
  "/search",
  asyncHandler(async (req, res) => {
    const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
    if (!query) throw ApiError.badRequest("Query parameter 'query' is required");
    const results = await searchExternalMovies(query);
    res.json({ results });
  }),
);

// Creates (or, if already imported once, updates) a local Movie row from
// an external search result. This is the only write path that touches
// external movie data — everything else in the app (bookings, shows,
// ratings) reads only from our own Movie table, which stays the source
// of truth an admin can also hand-edit afterward via the plain CRUD
// routes above.
router.post(
  "/import",
  validateBody(importExternalMovieSchema),
  asyncHandler(async (req, res) => {
    const details = await getExternalMovieDetails(req.body.externalId);
    const movie = await upsertMovieFromExternalDetails(details);
    res.status(201).json({ movie: await toMovieDTO(movie) });
  }),
);

const BULK_IMPORT_CONCURRENCY = 5;

// Resolves the curated title list (see data/curatedMovieTitles.ts)
// through OMDb, one request per title, `BULK_IMPORT_CONCURRENCY` at a
// time — a compromise between "as fast as possible" and "don't hammer a
// free-tier third-party API with 65 simultaneous requests." A title OMDb
// doesn't recognize is skipped, not treated as a failure (see
// getExternalMovieByTitle); a real config/network/auth problem still
// aborts the whole batch immediately, since every remaining title would
// fail identically.
router.post(
  "/bulk-import",
  asyncHandler(async (_req, res) => {
    const titles: string[] = CURATED_MOVIE_TITLES;
    const imported: string[] = [];
    const skipped: string[] = [];

    for (let i = 0; i < titles.length; i += BULK_IMPORT_CONCURRENCY) {
      const batch = titles.slice(i, i + BULK_IMPORT_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (title) => {
          const details = await getExternalMovieByTitle(title);
          if (!details) return { title, ok: false };
          await upsertMovieFromExternalDetails(details);
          return { title, ok: true };
        }),
      );
      for (const r of results) (r.ok ? imported : skipped).push(r.title);
    }

    res.json({ importedCount: imported.length, imported, skippedCount: skipped.length, skipped });
  }),
);

export default router;

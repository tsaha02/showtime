import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

// Thin wrapper around the OMDb API (https://www.omdbapi.com/) — used
// ONLY by the admin "Import movie" flow. See the comment on
// `Movie.externalId` in schema.prisma for why the module/route naming
// stays provider-agnostic ("external movie", not "omdb") even though
// OMDb is the only backing implementation today: this project already
// swapped providers once (TMDB → OMDb, when TMDB access turned out to be
// unreliable for this deployment), and there's no reason the next swap
// should need to rename anything customer- or admin-facing again.
//
// Same non-negotiable boundary as before: customers never call this
// directly, and nothing in the booking/seat-hold/concurrency path
// depends on it. An admin picks a search result, which UPSERTS a local
// `Movie` row — from then on it's an ordinary row this app owns.

const OMDB_BASE_URL = "https://www.omdbapi.com/";

export interface ExternalMovieSearchResult {
  externalId: string;
  title: string;
  overview: string;
  posterUrl: string | null;
  releaseDate: string | null;
}

export interface ExternalMovieDetails extends ExternalMovieSearchResult {
  durationMins: number | null;
  genre: string;
  // OMDb's own IMDb rating — surfaced to the public "discover" browsing
  // endpoints (see routes/movies.routes.ts's `/discover*` routes) as
  // informational third-party metadata for movies NOT (yet) in this
  // app's own catalog, which therefore have no local user reviews of
  // their own to show. Never conflated with `MovieDTO.averageRating`,
  // which is always this app's own users' ratings.
  imdbRating: number | null;
  director: string | null;
  actors: string | null;
  awards: string | null;
  language: string | null;
  country: string | null;
  rated: string | null; // age/content rating, e.g. "PG-13", "N/A" -> null
}

function requireApiKey(): string {
  if (!env.omdbApiKey) {
    throw ApiError.internal(
      "OMDB_API_KEY is not configured on the server. Get a free key from omdbapi.com/apikey.aspx, add it to apps/api/.env, then RESTART the API process (dotenv only reads .env at process startup).",
    );
  }
  return env.omdbApiKey;
}

// Handles transport-level failure only (can't reach OMDb, non-2xx HTTP,
// or OMDb explicitly rejecting the API key). Deliberately does NOT throw
// on OMDb's business-logic "Response: False" ("movie not found" etc.) —
// that's a normal, expected outcome for some lookups (especially in a
// bulk batch of guessed titles), and callers below decide whether that
// should surface as an error (single admin-driven import) or a silent
// skip (bulk import of a curated title list).
async function omdbFetch<T extends { Response: "True" | "False"; Error?: string }>(
  params: Record<string, string>,
): Promise<T> {
  const apiKey = requireApiKey();
  const url = new URL(OMDB_BASE_URL);
  url.searchParams.set("apikey", apiKey);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  let res: Response;
  try {
    res = await fetch(url.toString());
  } catch (err) {
    // fetch() throws for DNS failures/connection refused/timeouts — "we
    // couldn't reach OMDb at all" — worth telling apart from "OMDb
    // responded with an error" below.
    throw ApiError.internal(
      `Could not reach OMDb (network error: ${err instanceof Error ? err.message : String(err)}). Check the server's internet access / firewall.`,
    );
  }
  if (!res.ok) {
    throw ApiError.internal(`OMDb request failed with HTTP status ${res.status} ${res.statusText}`);
  }

  // OMDb always responds 200, even for an invalid key or "not found" —
  // errors are only visible in the JSON body's Response/Error field.
  const data = (await res.json()) as T;
  if (data.Response === "False" && data.Error?.toLowerCase().includes("invalid api key")) {
    throw ApiError.internal("OMDb rejected the configured API key. Check OMDB_API_KEY.");
  }
  return data;
}

interface OmdbSearchItem {
  Title: string;
  Year: string;
  imdbID: string;
  Poster: string;
}
interface OmdbSearchResponse {
  Response: "True" | "False";
  Error?: string;
  Search?: OmdbSearchItem[];
}

const posterUrlOrNull = (poster: string) => (poster && poster !== "N/A" ? poster : null);

export async function searchExternalMovies(query: string): Promise<ExternalMovieSearchResult[]> {
  const data = await omdbFetch<OmdbSearchResponse>({ s: query, type: "movie" });
  return (data.Search ?? []).slice(0, 12).map((r) => ({
    externalId: r.imdbID,
    title: r.Title,
    overview: "", // OMDb's search endpoint doesn't return a synopsis, only /?i= (details) does
    posterUrl: posterUrlOrNull(r.Poster),
    releaseDate: /^\d{4}$/.test(r.Year) ? `${r.Year}-01-01` : null,
  }));
}

interface OmdbDetailsResponse {
  Response: "True" | "False";
  Error?: string;
  imdbID: string;
  Title: string;
  Plot: string;
  Poster: string;
  Released: string; // e.g. "16 Jul 2010", or "N/A"
  Runtime: string; // e.g. "148 min", or "N/A"
  Genre: string; // e.g. "Action, Adventure, Sci-Fi"
  imdbRating: string; // e.g. "8.8", or "N/A"
  Director: string;
  Actors: string;
  Awards: string;
  Language: string;
  Country: string;
  Rated: string;
}

function parseReleased(released: string): string | null {
  if (!released || released === "N/A") return null;
  const parsed = new Date(released);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function parseRuntime(runtime: string): number | null {
  const match = /^(\d+)/.exec(runtime);
  return match ? Number(match[1]) : null;
}

const orNull = (value: string) => (value && value !== "N/A" ? value : null);

function toDetails(data: OmdbDetailsResponse): ExternalMovieDetails {
  const rating = Number(data.imdbRating);
  return {
    externalId: data.imdbID,
    title: data.Title,
    overview: data.Plot === "N/A" ? "" : data.Plot,
    posterUrl: posterUrlOrNull(data.Poster),
    releaseDate: parseReleased(data.Released),
    durationMins: parseRuntime(data.Runtime),
    genre: data.Genre && data.Genre !== "N/A" ? data.Genre : "Unknown",
    imdbRating: Number.isFinite(rating) ? rating : null,
    director: orNull(data.Director),
    actors: orNull(data.Actors),
    awards: orNull(data.Awards),
    language: orNull(data.Language),
    country: orNull(data.Country),
    rated: orNull(data.Rated),
  };
}

export async function getExternalMovieDetails(externalId: string): Promise<ExternalMovieDetails> {
  const data = await omdbFetch<OmdbDetailsResponse>({ i: externalId, plot: "full" });
  if (data.Response === "False") throw ApiError.badRequest(data.Error || "Movie not found");
  return toDetails(data);
}

// Used by the bulk-import flow (see admin/externalMovies.routes.ts): OMDb's
// `t=` (exact title) lookup returns the same full-details shape as the
// `i=` (by id) lookup in a single request, so a known title list can be
// resolved to real data one call per title — no separate search step
// needed. Returns null for a title OMDb doesn't recognize, so one bad
// title in a bulk batch skips silently rather than aborting the rest —
// a real config/network/auth failure (see omdbFetch) still throws and
// aborts the whole batch, since that's not "one bad title," it's "OMDb
// is unreachable" and every remaining title would fail identically.
export async function getExternalMovieByTitle(title: string): Promise<ExternalMovieDetails | null> {
  const data = await omdbFetch<OmdbDetailsResponse>({ t: title, plot: "full" });
  if (data.Response === "False") return null;
  return toDetails(data);
}

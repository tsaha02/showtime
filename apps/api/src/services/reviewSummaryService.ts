import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { groq, isAiConfigured, AI_MODEL } from "./aiService";

const MIN_REVIEWS_FOR_SUMMARY = 3;
const CACHE_TTL_SECONDS = 60 * 60 * 6; // 6h — same order as the OMDb trending cache

// Real reviewer text goes into the prompt (spoiler-tagged comments
// included — the AI needs the actual content to summarize; it's the
// UI, not the model input, that hides spoiler text from a human reader
// until they click to reveal it). Capped at a fixed count so a movie
// with hundreds of reviews doesn't balloon token usage — the most
// RECENT reviews are the most representative of current sentiment
// anyway, same reasoning `getMovieRatings` already orders by
// `createdAt: "desc"`.
const MAX_REVIEWS_IN_PROMPT = 30;

function cacheKey(movieId: string, reviewCount: number): string {
  // Keying on the review COUNT (not just movieId) is a cheap, good-
  // enough cache invalidation: a new review changes the count, which
  // busts the cache automatically without needing a separate
  // invalidation call from ratings.routes.ts every time a rating is
  // created.
  return `ai:review-summary:${movieId}:${reviewCount}`;
}

export interface ReviewSummary {
  points: string[];
  basedOnCount: number;
}

// Returns null when AI isn't configured, or when there simply isn't
// enough signal yet to summarize (fewer than MIN_REVIEWS_FOR_SUMMARY
// comments) — both are legitimate "nothing to show" states, not errors.
export async function summarizeMovieReviews(movieId: string): Promise<ReviewSummary | null> {
  if (!isAiConfigured()) return null;

  const reviews = await prisma.rating.findMany({
    where: { movieId, comment: { not: null } },
    orderBy: { createdAt: "desc" },
    take: MAX_REVIEWS_IN_PROMPT,
    select: { stars: true, comment: true },
  });
  if (reviews.length < MIN_REVIEWS_FOR_SUMMARY) return null;

  const cached = await redis.get(cacheKey(movieId, reviews.length));
  if (cached) return JSON.parse(cached);

  const reviewsBlock = reviews.map((r, i) => `${i + 1}. [${r.stars}/5 stars] ${r.comment}`).join("\n");

  const completion = await groq!.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 600,
    // See the identical comment in aiSearchService.ts — this model's
    // hidden chain-of-thought reasoning shares the same token budget
    // as the actual JSON answer, and at default effort it was
    // truncating the real output mid-string under real conditions.
    reasoning_effort: "low",
    messages: [
      {
        role: "system",
        content:
          "You summarize movie reviews for a ticket-booking app. Output ONLY a JSON array of 3-4 short strings " +
          "(each under 15 words), capturing the real consensus — both praise and complaints if the reviews are " +
          "mixed. No preamble, no markdown, just the JSON array.",
      },
      { role: "user", content: `Reviews:\n${reviewsBlock}` },
    ],
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) return null;

  let points: string[];
  try {
    points = JSON.parse(text.trim());
    if (!Array.isArray(points)) throw new Error("not an array");
  } catch {
    // A model that doesn't follow the "JSON only" instruction is a
    // formatting failure, not a reason to show the user a crash —
    // same "degrade, don't break" posture as every other optional
    // integration here.
    return null;
  }

  const result: ReviewSummary = { points, basedOnCount: reviews.length };
  await redis.set(cacheKey(movieId, reviews.length), JSON.stringify(result), "EX", CACHE_TTL_SECONDS);
  return result;
}

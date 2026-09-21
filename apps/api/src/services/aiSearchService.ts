import { prisma } from "../lib/prisma";
import { groq, isAiConfigured, AI_MODEL } from "./aiService";

// Deliberately NOT a vector-embedding/pgvector setup — at this
// project's catalog size (dozens of movies/events, not millions), the
// simplest correct thing is to hand the model the whole compact catalog
// and a natural-language query and let it reason directly over titles/
// genres/descriptions, the same "reduce over the relevant rows in
// memory" posture the analytics dashboard already uses rather than
// standing up separate infrastructure to solve a problem this small.
// If the catalog ever grew into the thousands, THAT'S when a real
// embedding index would earn its keep — not before.

export interface SemanticSearchResult {
  id: string;
  type: "movie" | "event";
  title: string;
  reason: string;
}

interface CatalogEntry {
  id: string;
  type: "movie" | "event";
  title: string;
  genreOrCategory: string;
  description: string;
}

async function loadBookableCatalog(): Promise<CatalogEntry[]> {
  const [movies, events] = await Promise.all([
    prisma.movie.findMany({
      where: { shows: { some: { kind: "MOVIE", startTime: { gte: new Date() } } } },
      select: { id: true, title: true, genre: true, description: true },
    }),
    prisma.event.findMany({
      where: { shows: { some: { kind: "EVENT", startTime: { gte: new Date() } } } },
      select: { id: true, title: true, category: true, description: true },
    }),
  ]);

  return [
    ...movies.map((m): CatalogEntry => ({ id: m.id, type: "movie", title: m.title, genreOrCategory: m.genre, description: m.description })),
    ...events.map((e): CatalogEntry => ({ id: e.id, type: "event", title: e.title, genreOrCategory: e.category, description: e.description })),
  ];
}

// Returns null when AI isn't configured or the catalog is empty —
// both "nothing to search" states the caller should treat the same as
// "no results," not an error.
export async function semanticSearchCatalog(query: string): Promise<SemanticSearchResult[] | null> {
  if (!isAiConfigured()) return null;

  const catalog = await loadBookableCatalog();
  if (catalog.length === 0) return [];

  const catalogBlock = catalog
    .map((c) => `${c.id}|${c.type}|${c.title}|${c.genreOrCategory}|${c.description.slice(0, 220)}`)
    .join("\n");

  const completion = await groq!.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 800,
    // This model does hidden chain-of-thought reasoning by default,
    // which counts against the SAME token budget as the actual answer
    // — at default effort it was eating enough of `max_tokens` that the
    // real JSON output got cut off mid-string (`finish_reason: "length"`,
    // caught live while testing this against the real catalog). Low
    // effort is plenty for "does this title match this request."
    reasoning_effort: "low",
    messages: [
      {
        role: "system",
        content:
          "You match a user's natural-language request to real, bookable titles from a movie/event ticketing " +
          "catalog. You are given a pipe-separated catalog (id|type|title|genre-or-category|description) and a " +
          "request. Pick at most 5 genuinely good matches — fewer is fine, an empty list is fine if nothing fits. " +
          'Output ONLY a JSON array of {"id": string, "reason": string} — reason is under 15 words and ' +
          "explains why THIS title matches THIS request specifically. No preamble, no markdown.",
      },
      { role: "user", content: `Catalog:\n${catalogBlock}\n\nRequest: ${query}` },
    ],
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) return [];

  let picks: { id: string; reason: string }[];
  try {
    picks = JSON.parse(text.trim());
    if (!Array.isArray(picks)) throw new Error("not an array");
  } catch {
    return [];
  }

  const byId = new Map(catalog.map((c) => [c.id, c]));
  return picks
    .filter((p) => byId.has(p.id))
    .map((p) => {
      const entry = byId.get(p.id)!;
      return { id: entry.id, type: entry.type, title: entry.title, reason: p.reason };
    });
}

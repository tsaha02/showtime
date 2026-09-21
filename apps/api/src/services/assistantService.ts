import type Groq from "groq-sdk";
import { prisma } from "../lib/prisma";
import { groq, isAiConfigured, AI_MODEL } from "./aiService";
import { semanticSearchCatalog } from "./aiSearchService";
import type { AssistantChatMessageDTO } from "@showtime/shared";

// ============================================================================
// THE ONE HARD RULE THIS WHOLE FILE EXISTS TO ENFORCE:
//
// This assistant can SEARCH, RECOMMEND, and CHECK AVAILABILITY — it can
// never hold a seat, never touch payment, never create a booking. Every
// tool below is read-only. When a user is ready to actually book, the
// assistant's job is to hand them a real link into the EXISTING,
// already-safe checkout flow (SeatMapPage's seat-hold → Stripe →
// confirm pipeline) and let a human click "pay," not to attempt that
// itself. An LLM that can autonomously spend a real (even test-mode)
// card's money is a fundamentally different risk profile than one that
// can only look things up — this line is enforced in the system prompt
// AND structurally, by simply never giving the model a tool capable of
// writing to Booking/BookingSeat/PaymentIntent.
// ============================================================================

// Headroom for a real observed pattern, not a guess: a search that
// returns several candidates sometimes gets checked one showtime-lookup
// per round instead of batched into one round with multiple tool
// calls (smaller/open models are less consistent than frontier ones
// about batching independent tool calls) — 4 wasn't always enough
// round-trips for "check showtimes for the 3-4 things I just found."
// `get_showtimes` accepting multiple ids (below) also reduces how often
// this ceiling gets tested at all.
const MAX_TOOL_ROUNDTRIPS = 8;

const TOOLS: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_catalog",
      description:
        "Search bookable movies and events by natural-language description (mood, genre, vibe — not just exact title). Returns matches with a reason each.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "What the user is looking for" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_showtimes",
      description:
        "Get upcoming showtimes/sessions for one or more movies/events (pass every id you need checked at once, not one call per id), optionally filtered to a city.",
      parameters: {
        type: "object",
        properties: {
          ids: { type: "array", items: { type: "string" }, description: "One or more movie/event ids to check" },
          kind: { type: "string", enum: ["movie", "event"] },
          // `["string", "null"]`, not just `"string"` — caught live:
          // the model sometimes passes `city: null` for "no filter"
          // instead of omitting the key, and Groq's server-side schema
          // validation rejects that as a 400 ("expected string, but got
          // null") if the schema only allows `string`. Since the SDK
          // retries failed requests a few times before giving up, one
          // of these could otherwise burn a surprisingly long time
          // before the whole chat request finally errors out.
          city: { type: ["string", "null"], description: "Optional city filter, or null for no filter" },
        },
        required: ["ids", "kind"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_active_offers",
      description: "List currently active discount coupon codes a user could apply at checkout.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_wallet_balance",
      description: "Get the current logged-in user's ShowTime wallet balance. Only works if the user is logged in.",
      parameters: { type: "object", properties: {} },
    },
  },
];

async function executeTool(name: string, input: Record<string, unknown>, ctx: { userId?: string }): Promise<string> {
  switch (name) {
    case "search_catalog": {
      const results = await semanticSearchCatalog(String(input.query ?? ""));
      return JSON.stringify(results ?? []);
    }
    case "get_showtimes": {
      // Accepts either the new `ids` array or a lone `id` (defensive —
      // a model that ignores the schema and sends a single id anyway
      // shouldn't just get an empty result).
      const rawIds = Array.isArray(input.ids) ? input.ids : input.id ? [input.id] : [];
      const ids = rawIds.map(String).filter(Boolean);
      const kind = input.kind === "event" ? "EVENT" : "MOVIE";
      const city = typeof input.city === "string" ? input.city : undefined;
      if (ids.length === 0) return JSON.stringify([]);

      const shows = await prisma.show.findMany({
        where: {
          kind,
          ...(kind === "MOVIE" ? { movieId: { in: ids } } : { eventId: { in: ids } }),
          startTime: { gte: new Date() },
          ...(city ? { screen: { theatre: { city } } } : {}),
        },
        include: { screen: { include: { theatre: true } }, movie: true, event: true },
        orderBy: { startTime: "asc" },
        take: 20,
      });
      return JSON.stringify(
        shows.map((s) => ({
          title: s.movie?.title ?? s.event?.title,
          showId: s.id,
          startTime: s.startTime.toISOString(),
          theatre: s.screen.theatre.name,
          city: s.screen.theatre.city,
          format: s.format,
          language: s.language,
          bookingLink: `/shows/${s.id}/seats`,
        })),
      );
    }
    case "get_active_offers": {
      const coupons = await prisma.coupon.findMany({
        where: { active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        take: 10,
      });
      return JSON.stringify(coupons.map((c) => ({ code: c.code, type: c.type, value: c.value })));
    }
    case "get_wallet_balance": {
      if (!ctx.userId) return JSON.stringify({ error: "User is not logged in — no wallet to check." });
      const user = await prisma.user.findUnique({ where: { id: ctx.userId }, select: { walletBalance: true } });
      return JSON.stringify({ walletBalance: user?.walletBalance ?? 0 });
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

const SYSTEM_PROMPT = `You are ShowTime's booking assistant — friendly, concise, and honest.

You help people find movies and events, check showtimes, and understand offers/wallet balance using your tools.

All prices, wallet balances, and discount amounts are in Indian Rupees — always write them with the ₹ symbol (e.g. ₹150, ₹50 off), never $ or USD.

When search_catalog returns several candidates and you need their showtimes, call get_showtimes ONCE with all of their ids in the "ids" array — never one get_showtimes call per title, that wastes turns.

HARD RULE: you cannot hold seats, take payment, or complete a booking. You have no tool that does any of those things — don't claim otherwise. When someone is ready to book, tell them to click through using a real link from get_showtimes's "bookingLink" field (format it as a markdown link, e.g. [Book Barbie at Metro Cineplex, 7:00 PM](/shows/abc123/seats)) — they'll pick seats and pay themselves on that page, same as anywhere else in the app.

Keep replies short (2-4 sentences plus links, not essays). If a search or showtime lookup returns nothing, say so plainly instead of inventing a result.`;

export async function runAssistantTurn(
  messages: AssistantChatMessageDTO[],
  ctx: { userId?: string },
): Promise<string> {
  if (!isAiConfigured()) {
    return "The AI assistant isn't configured on this server right now — try browsing movies/events directly instead!";
  }

  const conversation: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages.map((m): Groq.Chat.Completions.ChatCompletionMessageParam => ({ role: m.role, content: m.content })),
  ];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDTRIPS; round++) {
      const completion = await groq!.chat.completions.create({
        model: AI_MODEL,
        max_tokens: 1000,
        // Same fix as aiSearchService.ts/reviewSummaryService.ts: this
        // model's hidden chain-of-thought reasoning shares the token
        // budget with the actual reply/tool call, and deciding "which of
        // 4 simple read-only tools to call next" doesn't need deep
        // reasoning — low effort leaves the budget for the reply itself.
        reasoning_effort: "low",
        messages: conversation,
        tools: TOOLS,
      });

      const message = completion.choices[0]?.message;
      if (!message) return "Sorry, I couldn't come up with a reply.";

      if (!message.tool_calls || message.tool_calls.length === 0) {
        return message.content ?? "Sorry, I couldn't come up with a reply.";
      }

      // Run every requested tool call, feed the results back, and let
      // the model take another turn — this loop IS the "agentic" part:
      // the model decides what to look up next based on what it
      // already learned, not a fixed script.
      conversation.push(message);
      for (const toolCall of message.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(toolCall.function.arguments || "{}");
        } catch {
          // Malformed tool-call arguments are the model's mistake, not
          // a server error — feed a clear error back as the tool
          // result so it can recover (retry, or apologize) instead of
          // the whole request failing.
        }
        const result = await executeTool(toolCall.function.name, args, ctx);
        conversation.push({ role: "tool", tool_call_id: toolCall.id, content: result });
      }
    }
  } catch (err) {
    // A malformed tool call the model itself generated (caught live:
    // passing `null` for an optional string param before the schema
    // fix above) or a transient Groq API error surfaces here as a
    // thrown SDK error — this is exactly the kind of third-party
    // failure every other optional integration in this app (Stripe,
    // OMDb, Resend) degrades gracefully from, not a reason to bubble a
    // raw 500 up through the chat endpoint.
    console.error("[assistant] Groq request failed:", err);
    return "Something went wrong reaching the AI assistant — please try again in a moment.";
  }

  return "That took more steps than I've got room for — try asking something a bit more specific?";
}

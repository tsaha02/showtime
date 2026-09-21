import Groq from "groq-sdk";
import { env } from "../config/env";

// One shared client for every GenAI feature in this app (review
// summaries, catalog search, the booking assistant). Groq hosts open
// models (Llama, etc.) behind a fast, OpenAI-compatible chat-completions
// API — same graceful-degradation posture as Stripe/OMDb/Resend:
// without GROQ_API_KEY, `groq` is null and every caller checks
// `isAiConfigured()` first rather than the app failing to boot or a
// route crashing on a missing credential.
// `timeout`/`maxRetries` bounded explicitly rather than left at the
// SDK's defaults (1 minute, 2 retries) — caught live: a request that
// hits a genuinely non-retryable error (a malformed tool-call
// argument the model generated) still gets retried a few times with
// growing backoff before the SDK gives up, and across the assistant's
// own multi-round tool-use loop that compounded into one chat request
// taking 14 real minutes before finally failing. 20s/1 retry keeps the
// worst case sane without changing anything about the happy path.
export const groq = env.groqApiKey ? new Groq({ apiKey: env.groqApiKey, timeout: 20_000, maxRetries: 1 }) : null;

export function isAiConfigured(): boolean {
  return groq !== null;
}

// Centralized so every feature uses the same model — one place to swap
// it later rather than three. Groq's available model lineup changes
// over time (models get retired) — checked live against
// https://api.groq.com/openai/v1/models rather than assumed; gpt-oss-120b
// is currently Groq's largest general-purpose chat model with reliable
// JSON output and tool-use, which is what the booking assistant leans
// on hardest.
export const AI_MODEL = "openai/gpt-oss-120b";

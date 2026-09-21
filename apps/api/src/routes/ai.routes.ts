import { Router } from "express";
import rateLimit from "express-rate-limit";
import { aiSearchSchema, assistantChatSchema } from "@showtime/shared";
import { validateBody } from "../middleware/validate";
import { optionalCustomerAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { semanticSearchCatalog } from "../services/aiSearchService";
import { runAssistantTurn } from "../services/assistantService";

const router = Router();

// Tighter than most public endpoints — every request here is a real,
// billed LLM call (search) or several (the chat assistant, one per
// tool-use round-trip), unlike the free-to-run rest of this API.
const aiRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 });

router.post(
  "/search",
  aiRateLimit,
  validateBody(aiSearchSchema),
  asyncHandler(async (req, res) => {
    const results = await semanticSearchCatalog(req.body.query);
    res.json({ results });
  }),
);

router.post(
  "/chat",
  aiRateLimit,
  optionalCustomerAuth,
  validateBody(assistantChatSchema),
  asyncHandler(async (req, res) => {
    const reply = await runAssistantTurn(req.body.messages, { userId: req.user?.id });
    res.json({ reply });
  }),
);

export default router;

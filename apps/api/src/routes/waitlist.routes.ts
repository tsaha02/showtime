import { Router } from "express";
import rateLimit from "express-rate-limit";
import { joinWaitlistSchema } from "@showtime/shared";
import { validateBody } from "../middleware/validate";
import { asyncHandler } from "../utils/asyncHandler";
import { joinWaitlist } from "../services/waitlistService";

const router = Router();

const waitlistRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 });

router.post(
  "/",
  waitlistRateLimit,
  validateBody(joinWaitlistSchema),
  asyncHandler(async (req, res) => {
    await joinWaitlist(req.body.movieId, req.body.email);
    res.status(204).send();
  }),
);

export default router;

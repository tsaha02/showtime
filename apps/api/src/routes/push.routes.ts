import { Router } from "express";
import rateLimit from "express-rate-limit";
import { pushSubscribeSchema, pushUnsubscribeSchema } from "@showtime/shared";
import { validateBody } from "../middleware/validate";
import { requireSessionId } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { getVapidPublicKey, isPushConfigured, saveSubscription, removeSubscription } from "../services/pushNotificationService";

const router = Router();

const pushRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30 });

// Not behind requireSessionId: the frontend calls this before it knows
// whether it's even worth prompting for notification permission at
// all — a null key means "don't bother," same degrade-quietly posture
// as every other optional integration in this app.
router.get("/vapid-public-key", (_req, res) => {
  res.json({ publicKey: isPushConfigured() ? getVapidPublicKey() : null });
});

router.post(
  "/subscribe",
  pushRateLimit,
  requireSessionId,
  validateBody(pushSubscribeSchema),
  asyncHandler(async (req, res) => {
    await saveSubscription(req.sessionId, req.body);
    res.status(204).send();
  }),
);

router.post(
  "/unsubscribe",
  pushRateLimit,
  requireSessionId,
  validateBody(pushUnsubscribeSchema),
  asyncHandler(async (req, res) => {
    await removeSubscription(req.body.endpoint);
    res.status(204).send();
  }),
);

export default router;

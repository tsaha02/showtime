import { Router } from "express";
import { requireSessionId } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { buildSeatMap } from "../services/seatMapService";

const router = Router();

router.get(
  "/:showId/seatmap",
  requireSessionId,
  asyncHandler(async (req, res) => {
    const map = await buildSeatMap(req.params.showId, req.sessionId);
    res.json(map);
  }),
);

export default router;

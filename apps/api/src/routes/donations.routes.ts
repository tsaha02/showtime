import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { getTotalDonations } from "../services/donationService";

const router = Router();

router.get(
  "/total",
  asyncHandler(async (_req, res) => {
    const total = await getTotalDonations();
    res.json({ total });
  }),
);

export default router;

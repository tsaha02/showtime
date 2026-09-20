import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { prisma } from "../lib/prisma";

const router = Router();

// Public menu for the checkout F&B step — only active items, in
// admin-controlled category groupings the frontend can render as
// sections (see FoodCategory).
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const foodItems = await prisma.foodItem.findMany({
      where: { active: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    res.json({ foodItems });
  }),
);

export default router;

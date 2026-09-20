import { Router } from "express";
import { foodItemSchema } from "@showtime/shared";
import { validateBody } from "../../middleware/validate";
import { requireAdminAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { prisma } from "../../lib/prisma";

const router = Router();
router.use(requireAdminAuth);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const foodItems = await prisma.foodItem.findMany({ orderBy: { createdAt: "desc" } });
    res.json({ foodItems });
  }),
);

router.post(
  "/",
  validateBody(foodItemSchema),
  asyncHandler(async (req, res) => {
    const foodItem = await prisma.foodItem.create({
      data: {
        name: req.body.name,
        description: req.body.description ?? null,
        price: req.body.price,
        category: req.body.category,
        imageUrl: req.body.imageUrl ?? null,
        active: req.body.active ?? true,
      },
    });
    res.status(201).json({ foodItem });
  }),
);

router.put(
  "/:id",
  validateBody(foodItemSchema),
  asyncHandler(async (req, res) => {
    const foodItem = await prisma.foodItem
      .update({
        where: { id: req.params.id },
        data: {
          name: req.body.name,
          description: req.body.description ?? null,
          price: req.body.price,
          category: req.body.category,
          imageUrl: req.body.imageUrl ?? null,
          active: req.body.active ?? true,
        },
      })
      .catch(() => null);
    if (!foodItem) throw ApiError.notFound("Food item not found");
    res.json({ foodItem });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.foodItem.delete({ where: { id: req.params.id } }).catch(() => {
      throw ApiError.notFound("Food item not found");
    });
    res.status(204).send();
  }),
);

export default router;

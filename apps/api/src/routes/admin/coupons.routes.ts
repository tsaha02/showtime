import { Router } from "express";
import { couponSchema } from "@showtime/shared";
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
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: "desc" } });
    res.json({ coupons });
  }),
);

router.post(
  "/",
  validateBody(couponSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.coupon.findUnique({ where: { code: req.body.code } });
    if (existing) throw ApiError.conflict("A coupon with this code already exists");

    const coupon = await prisma.coupon.create({
      data: {
        code: req.body.code,
        type: req.body.type,
        value: req.body.value,
        maxUses: req.body.maxUses ?? null,
        active: req.body.active ?? true,
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
      },
    });
    res.status(201).json({ coupon });
  }),
);

router.put(
  "/:id",
  validateBody(couponSchema),
  asyncHandler(async (req, res) => {
    const coupon = await prisma.coupon
      .update({
        where: { id: req.params.id },
        data: {
          code: req.body.code,
          type: req.body.type,
          value: req.body.value,
          maxUses: req.body.maxUses ?? null,
          active: req.body.active ?? true,
          expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
        },
      })
      .catch(() => null);
    if (!coupon) throw ApiError.notFound("Coupon not found");
    res.json({ coupon });
  }),
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await prisma.coupon.delete({ where: { id: req.params.id } }).catch(() => {
      throw ApiError.notFound("Coupon not found");
    });
    res.status(204).send();
  }),
);

export default router;

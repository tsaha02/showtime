import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { prisma } from "../lib/prisma";

const router = Router();

// A browsable "offers wall" over the existing Coupon backend — until
// now, a coupon was only discoverable if you already knew its code
// (entered at checkout). This is a read-only, public view of the same
// data filtered to what's actually usable right now: active, not
// expired, and (when capped) not already fully used — deliberately NOT
// exposing `usedCount` itself, which is an internal admin detail, not
// something a shopper needs to see.
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const coupons = await prisma.coupon.findMany({
      where: {
        active: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: "desc" },
    });

    const offers = coupons
      .filter((c) => c.maxUses === null || c.usedCount < c.maxUses)
      .map((c) => ({
        code: c.code,
        type: c.type,
        value: c.value,
        expiresAt: c.expiresAt?.toISOString() ?? null,
      }));

    res.json({ offers });
  }),
);

export default router;

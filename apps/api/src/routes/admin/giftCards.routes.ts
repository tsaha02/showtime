import { Router } from "express";
import { requireAdminAuth } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { prisma } from "../../lib/prisma";

const router = Router();
router.use(requireAdminAuth);

// Read-only — gift cards are customer-purchased, not admin-created, so
// there's no CRUD here, just visibility into what's been sold/redeemed
// (useful for support: "a customer says their gift card didn't work").
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const giftCards = await prisma.giftCard.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({
      giftCards: giftCards.map((g) => ({
        id: g.id,
        code: g.code,
        value: g.value,
        purchasedByEmail: g.purchasedByEmail,
        recipientEmail: g.recipientEmail,
        redeemed: g.redeemed,
        redeemedAt: g.redeemedAt?.toISOString() ?? null,
        createdAt: g.createdAt.toISOString(),
      })),
    });
  }),
);

export default router;

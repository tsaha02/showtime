import { Router } from "express";
import { requireCustomerAuth } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { prisma } from "../lib/prisma";

const router = Router();

router.get(
  "/transactions",
  requireCustomerAuth,
  asyncHandler(async (req, res) => {
    const transactions = await prisma.walletTransaction.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json({
      transactions: transactions.map((t) => ({
        id: t.id,
        amount: t.amount,
        reason: t.reason,
        bookingId: t.bookingId,
        createdAt: t.createdAt.toISOString(),
      })),
    });
  }),
);

export default router;

import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Distinct list of cities that have at least one theatre — backs the
// "browse by city" filter on the home page (see movies.routes.ts's `city`
// query param). Registered before "/:id"-shaped routes would matter if
// this router had any; it doesn't, but the static route still goes first
// as a matter of habit.
router.get(
  "/cities",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.theatre.findMany({ select: { city: true }, distinct: ["city"] });
    res.json({ cities: rows.map((r) => r.city).sort() });
  }),
);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const theatres = await prisma.theatre.findMany({ orderBy: { name: "asc" } });
    res.json({ theatres });
  }),
);

export default router;

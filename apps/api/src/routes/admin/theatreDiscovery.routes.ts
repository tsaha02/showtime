import { Router } from "express";
import { z } from "zod";
import { requireAdminAuth } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/ApiError";
import { prisma } from "../../lib/prisma";
import { searchNearbyRealTheatres } from "../../services/theatreDiscoveryService";
import { generateDefaultSeatLayout } from "../../utils/seatLayoutGenerator";

const router = Router();
router.use(requireAdminAuth);

router.get(
  "/search",
  asyncHandler(async (req, res) => {
    const city = typeof req.query.city === "string" ? req.query.city.trim() : "";
    if (!city) throw ApiError.badRequest("Query parameter 'city' is required");
    const results = await searchNearbyRealTheatres(city);
    res.json({ results });
  }),
);

const importSchema = z.object({
  osmId: z.string().min(1),
  name: z.string().min(1),
  address: z.string().nullable(),
  city: z.string().min(1),
  lat: z.number().optional(),
  lon: z.number().optional(),
});

// Creates a local Theatre from a real OpenStreetMap cinema location, with
// two screens and a default seat layout auto-generated (see
// seatLayoutGenerator.ts's comment on why — no free source publishes a
// real cinema's actual seating chart) so it's immediately bookable-
// capable rather than needing several more manual admin steps before an
// admin can even create a Show against it. Upserted by osmId, same
// re-import-updates-not-duplicates pattern as Movie.externalId.
router.post(
  "/import",
  validateBody(importSchema),
  asyncHandler(async (req, res) => {
    const { osmId, name, address, city, lat, lon } = req.body;

    const theatre = await prisma.theatre.upsert({
      where: { osmId },
      create: { osmId, name, city, address: address ?? `${name}, ${city}`, lat: lat ?? null, lon: lon ?? null },
      update: { name, city, address: address ?? `${name}, ${city}`, lat: lat ?? null, lon: lon ?? null },
    });

    const existingScreens = await prisma.screen.count({ where: { theatreId: theatre.id } });
    if (existingScreens === 0) {
      for (const screenName of ["Screen 1", "Screen 2"]) {
        const screen = await prisma.screen.create({ data: { theatreId: theatre.id, name: screenName } });
        const layout = await prisma.seatLayout.create({ data: { screenId: screen.id } });
        await prisma.seat.createMany({
          data: generateDefaultSeatLayout().map((s) => ({ ...s, layoutId: layout.id })),
        });
      }
    }

    const full = await prisma.theatre.findUnique({ where: { id: theatre.id }, include: { screens: true } });
    res.status(201).json({ theatre: full });
  }),
);

export default router;

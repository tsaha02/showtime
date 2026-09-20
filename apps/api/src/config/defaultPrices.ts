import type { SeatCategory } from "@prisma/client";

// A reasonable starting price per seat category, used wherever a show
// needs pricing without an admin having specified it explicitly yet
// (the seed script, and the "Auto-schedule shows" bulk admin action).
// An admin can always override per-show pricing via the normal show
// creation form — this is just a sane default, not a business rule.
export const DEFAULT_SEAT_PRICES: Record<SeatCategory, number> = {
  SILVER: 150,
  GOLD: 250,
  PREMIUM: 400,
  RECLINER: 600,
};

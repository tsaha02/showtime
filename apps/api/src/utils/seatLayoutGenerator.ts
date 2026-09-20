import type { SeatCategory } from "@prisma/client";

// Category order determines row assignment below: earlier rows (closer
// to the screen) are cheaper, back rows are pricier — a common real-
// world layout that also gives every generated screen at least two seat
// categories, as the project brief asks for.
const CATEGORY_BY_ROW_INDEX: SeatCategory[] = ["SILVER", "SILVER", "GOLD", "GOLD", "PREMIUM", "RECLINER"];

export interface GeneratedSeat {
  row: number;
  col: number;
  label: string;
  category: SeatCategory;
  wheelchairAccessible: boolean;
}

// Builds one screen's default seat grid. Demonstrates the row/col vs
// label decoupling described on the `Seat` model in schema.prisma: col
// index 5 (a center aisle) is skipped entirely for every row, so the
// grid has a real gap, but seat LABELS stay a dense "A1, A2, ... A9"
// sequence. The RECLINER row is also physically narrower (fewer, wider
// seats), another kind of gap the row/col model handles for free.
//
// Used both by the seed script (`prisma/seed.ts`) and by the admin
// "Import real theatre" flow (`routes/admin/theatreDiscovery.routes.ts`)
// — a newly discovered real-world theatre still needs SOME seat layout
// to be bookable at all, and there is no free public source for a real
// cinema's actual seating chart (that's exactly the kind of operational
// detail no third party publishes) — so every screen, real or seeded,
// starts from this same reasonable default, which an admin can then
// hand-edit via the seat layout editor once the theatre's real layout is
// known.
export function generateDefaultSeatLayout(): GeneratedSeat[] {
  const seats: GeneratedSeat[] = [];
  const AISLE_COL = 5;

  CATEGORY_BY_ROW_INDEX.forEach((category, rowIndex) => {
    const rowLetter = String.fromCharCode(65 + rowIndex);
    const isReclinerRow = category === "RECLINER";
    const colRange = isReclinerRow ? [2, 3, 4, 6, 7, 8] : [0, 1, 2, 3, 4, 6, 7, 8, 9, 10];

    let seatNumber = 1;
    for (const col of colRange) {
      if (col === AISLE_COL) continue; // unreachable given colRange above, kept for clarity
      // The two aisle-adjacent seats in the front row are marked
      // wheelchair-accessible — a realistic default (easiest to reach
      // without crossing other seats), same spirit as this generator's
      // other placement choices (cheaper seats up front, a real aisle).
      const wheelchairAccessible = rowIndex === 0 && (col === AISLE_COL - 1 || col === AISLE_COL + 1);
      seats.push({ row: rowIndex, col, label: `${rowLetter}${seatNumber}`, category, wheelchairAccessible });
      seatNumber++;
    }
  });

  return seats;
}

/**
 * Standalone demonstration of the two concurrency-safety layers described
 * in bookingService.ts. Not part of the app's request path — this is a
 * script you run manually to prove, in an interview, exactly what each
 * layer does and doesn't do.
 *
 * Usage (after `npm run db:seed`, which creates a demo show with seats):
 *   npx tsx scripts/race-test.ts redis   # proves the Redis hold layer
 *   npx tsx scripts/race-test.ts db      # proves the Postgres constraint layer
 *
 * "redis" scenario: two "sessions" both try to acquire a hold on the SAME
 * seat via acquireHold() at (as close as Node's event loop allows) the
 * same instant. `SET NX` guarantees exactly one succeeds.
 *
 * "db" scenario: this is the important one. It calls Prisma directly and
 * DELIBERATELY SKIPS the Redis hold check that confirmBooking() normally
 * does first — simulating the scenario the write-up calls out explicitly:
 * "what if Redis is unavailable, restarted, or a hold's TTL races with a
 * confirm". Two transactions both try to insert a BookingSeat row for the
 * identical (showId, seatId). Only one commits; the other fails on the
 * unique constraint and is caught, proving the database — not Redis — is
 * the actual guarantee against double-booking.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import Redis from "ioredis";

const prisma = new PrismaClient();

async function runDbRaceScenario() {
  const seat = await prisma.seat.findFirst({
    include: { layout: { include: { screen: { include: { shows: true } } } } },
  });
  const show =
    seat?.layout.screen.shows[0] ?? (await prisma.show.findFirst({ include: { prices: true } }));
  if (!seat || !show) throw new Error("Seed data not found — run `npm run db:seed` first");

  const price = (await prisma.showSeatPrice.findFirst({ where: { showId: show.id, category: seat.category } }))
    ?.price ?? 500;

  console.log(`Racing two concurrent bookings for seat ${seat.label} on show ${show.id}...`);

  const attempt = async (label: string) => {
    try {
      await prisma.$transaction(async (tx) => {
        const booking = await tx.booking.create({
          data: {
            reference: `RACE-${label}-${Date.now()}`,
            status: "CONFIRMED",
            showId: show.id,
            totalAmount: price,
            guestName: `Racer ${label}`,
            guestEmail: `racer-${label}@example.com`,
            seatsSnapshot: [{ seatId: seat.id, label: seat.label, category: seat.category, price }],
          },
        });
        // Tiny artificial delay widens the race window so both
        // transactions are genuinely in flight at once, rather than
        // one finishing before the other even starts.
        await new Promise((r) => setTimeout(r, 100));
        await tx.bookingSeat.createMany({
          data: [{ bookingId: booking.id, showId: show.id, seatId: seat.id, category: seat.category, price }],
        });
      });
      console.log(`  [${label}] SUCCEEDED — booked the seat`);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        console.log(`  [${label}] REJECTED — unique constraint violation (seat already booked)`);
      } else {
        throw err;
      }
    }
  };

  await Promise.all([attempt("A"), attempt("B")]);

  const count = await prisma.bookingSeat.count({ where: { showId: show.id, seatId: seat.id } });
  console.log(`\nFinal BookingSeat rows for this seat: ${count} (must be exactly 1)`);

  // Cleanup so the script is repeatable.
  await prisma.bookingSeat.deleteMany({ where: { showId: show.id, seatId: seat.id } });
  await prisma.booking.deleteMany({ where: { reference: { startsWith: "RACE-" } } });
}

async function runRedisRaceScenario() {
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  const showId = "race-test-show";
  const seatId = "race-test-seat";
  await redis.del(`seat:${showId}:${seatId}`);

  const acquire = async (sessionId: string) => {
    const result = await redis.set(`seat:${showId}:${seatId}`, sessionId, "EX", 300, "NX");
    console.log(`  [${sessionId}] ${result === "OK" ? "ACQUIRED the hold" : "REJECTED — already held"}`);
  };

  console.log("Racing two concurrent hold attempts on the same seat...");
  await Promise.all([acquire("session-A"), acquire("session-B")]);

  await redis.del(`seat:${showId}:${seatId}`);
  await redis.quit();
}

const scenario = process.argv[2];
(async () => {
  if (scenario === "redis") await runRedisRaceScenario();
  else if (scenario === "db") await runDbRaceScenario();
  else {
    console.error("Usage: tsx scripts/race-test.ts <redis|db>");
    process.exit(1);
  }
  await prisma.$disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

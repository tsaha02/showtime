import { PrismaClient, SeatCategory } from "@prisma/client";
import bcrypt from "bcrypt";
import { generateDefaultSeatLayout } from "../src/utils/seatLayoutGenerator";
import { DEFAULT_SEAT_PRICES as PRICES } from "../src/config/defaultPrices";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding ShowTime...");

  await prisma.rating.deleteMany();
  await prisma.bookingSeat.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.showSeatPrice.deleteMany();
  await prisma.show.deleteMany();
  await prisma.seat.deleteMany();
  await prisma.seatLayout.deleteMany();
  await prisma.screen.deleteMany();
  await prisma.theatre.deleteMany();
  await prisma.movie.deleteMany();
  await prisma.user.deleteMany();

  // --- Users ---
  // Seeded accounts are pre-verified so demo logins work immediately
  // without needing to run the OTP flow — that flow is still fully live
  // for anyone who registers a NEW account through the app.
  const adminPasswordHash = await bcrypt.hash("Admin123!", 10);
  await prisma.user.create({
    data: {
      name: "Ava Admin",
      email: "admin@showtime.dev",
      passwordHash: adminPasswordHash,
      role: "ADMIN",
      emailVerified: true,
    },
  });

  const demoPasswordHash = await bcrypt.hash("Demo1234!", 10);
  const demoUser = await prisma.user.create({
    data: {
      name: "Deepa Demo",
      email: "demo@showtime.dev",
      passwordHash: demoPasswordHash,
      role: "CUSTOMER",
      emailVerified: true,
    },
  });
  await prisma.user.create({
    data: {
      name: "Sam Sample",
      email: "sam@showtime.dev",
      passwordHash: demoPasswordHash,
      role: "CUSTOMER",
      emailVerified: true,
    },
  });

  // --- Movies ---
  const movieData = [
    {
      title: "The Last Signal",
      description:
        "A deep-space communications officer intercepts a message that shouldn't exist, and has to decide whether to answer it.",
      durationMins: 128,
      genre: "Sci-Fi",
      posterUrl: "https://picsum.photos/seed/last-signal/400/600",
      releaseDate: new Date("2026-06-12"),
    },
    {
      title: "Comedy Night Live",
      description: "Four stand-up comics, one green room, and a blackout thirty minutes before showtime.",
      durationMins: 95,
      genre: "Comedy",
      posterUrl: "https://picsum.photos/seed/comedy-night/400/600",
      releaseDate: new Date("2026-07-01"),
    },
    {
      title: "Shadows of Kolkata",
      description: "A detective drama following one long night through the alleys of a city that never sleeps.",
      durationMins: 142,
      genre: "Drama",
      posterUrl: "https://picsum.photos/seed/shadows-kolkata/400/600",
      releaseDate: new Date("2026-05-20"),
    },
    {
      title: "Turbo Chase",
      description: "An ex-stunt driver is pulled back in for one last, impossible heist.",
      durationMins: 110,
      genre: "Action",
      posterUrl: "https://picsum.photos/seed/turbo-chase/400/600",
      releaseDate: new Date("2026-08-15"),
    },
  ];
  const movies = await Promise.all(movieData.map((m) => prisma.movie.create({ data: m })));
  const [lastSignal, comedyNight, shadowsKolkata, turboChase] = movies;

  // --- Theatres & screens, across many Indian cities ---
  // No free public API exists for real theatre/showtime listings (that's
  // proprietary business data owned by platforms like BookMyShow itself)
  // — so, like the rest of the catalog admins can hand-edit, this is a
  // curated dataset, not a live feed. It's deliberately spread across ten
  // cities (not one) so the customer app's city filter ("movies near me"
  // — see README) has real options to demonstrate against. Two screens
  // per theatre, named per-theatre so show-creation below can refer to
  // specific ones (for the past/guest-booking anchors) instead of by
  // fragile array index.
  const theatreData = [
    { key: "metroCineplex", name: "Metro Cineplex", city: "Kolkata", address: "12 Park Street, Kolkata" },
    { key: "riversideMultiplex", name: "Riverside Multiplex", city: "Kolkata", address: "45 Riverside Road, Kolkata" },
    { key: "bandraBigScreen", name: "Bandra Big Screen", city: "Mumbai", address: "8 Linking Road, Bandra West, Mumbai" },
    { key: "andheriCineworld", name: "Andheri Cineworld", city: "Mumbai", address: "Andheri West, Mumbai" },
    { key: "connaughtCinemaHub", name: "Connaught Cinema Hub", city: "Delhi", address: "21 Connaught Place, New Delhi" },
    { key: "saketSelectScreens", name: "Saket Select Screens", city: "Delhi", address: "Saket, New Delhi" },
    { key: "indiranagarImax", name: "Indiranagar IMAX", city: "Bangalore", address: "100 Ft Road, Indiranagar, Bangalore" },
    { key: "whitefieldMultiplex", name: "Whitefield Multiplex", city: "Bangalore", address: "Whitefield, Bangalore" },
    { key: "marinaMovieHouse", name: "Marina Movie House", city: "Chennai", address: "Marina Beach Road, Chennai" },
    { key: "tNagarTalkies", name: "T Nagar Talkies", city: "Chennai", address: "T Nagar, Chennai" },
    { key: "hitechCityCinemas", name: "Hitech City Cinemas", city: "Hyderabad", address: "Hitech City, Hyderabad" },
    { key: "banjaraHillsScreens", name: "Banjara Hills Screens", city: "Hyderabad", address: "Banjara Hills, Hyderabad" },
    { key: "koregaonParkCinema", name: "Koregaon Park Cinema", city: "Pune", address: "Koregaon Park, Pune" },
    { key: "vimanNagarMultiplex", name: "Viman Nagar Multiplex", city: "Pune", address: "Viman Nagar, Pune" },
    { key: "sgHighwayScreens", name: "SG Highway Screens", city: "Ahmedabad", address: "SG Highway, Ahmedabad" },
    { key: "navrangpuraCinema", name: "Navrangpura Cinema", city: "Ahmedabad", address: "Navrangpura, Ahmedabad" },
    { key: "miRoadMovieHouse", name: "MI Road Movie House", city: "Jaipur", address: "MI Road, Jaipur" },
    { key: "malviyaNagarCinemas", name: "Malviya Nagar Cinemas", city: "Jaipur", address: "Malviya Nagar, Jaipur" },
    { key: "hazratganjTalkies", name: "Hazratganj Talkies", city: "Lucknow", address: "Hazratganj, Lucknow" },
    { key: "gomtiNagarScreens", name: "Gomti Nagar Screens", city: "Lucknow", address: "Gomti Nagar, Lucknow" },
  ] as const;

  const screensByTheatreKey: Record<string, { screen1: string; screen2: string }> = {};
  for (const t of theatreData) {
    const theatre = await prisma.theatre.create({ data: { name: t.name, city: t.city, address: t.address } });
    const screenIds: string[] = [];
    for (const name of ["Screen 1", "Screen 2"]) {
      const screen = await prisma.screen.create({ data: { theatreId: theatre.id, name } });
      const layout = await prisma.seatLayout.create({ data: { screenId: screen.id } });
      await prisma.seat.createMany({ data: generateDefaultSeatLayout().map((s) => ({ ...s, layoutId: layout.id })) });
      screenIds.push(screen.id);
    }
    screensByTheatreKey[t.key] = { screen1: screenIds[0], screen2: screenIds[1] };
  }

  // --- Shows ---
  const now = new Date();
  const hours = (n: number) => n * 60 * 60 * 1000;

  async function createShow(movieId: string, screenId: string, startTime: Date, durationMins: number) {
    const endTime = new Date(startTime.getTime() + durationMins * 60_000);
    const show = await prisma.show.create({ data: { movieId, screenId, startTime, endTime } });
    await prisma.showSeatPrice.createMany({
      data: (Object.keys(PRICES) as SeatCategory[]).map((category) => ({
        showId: show.id,
        category,
        price: PRICES[category],
      })),
    });
    return show;
  }

  const metro = screensByTheatreKey.metroCineplex;
  const bandra = screensByTheatreKey.bandraBigScreen;

  // A show that already ended, specifically so ratings can be demoed
  // immediately without booking-and-waiting.
  const pastShow = await createShow(lastSignal.id, metro.screen1, new Date(now.getTime() - hours(50)), lastSignal.durationMins);

  // One future show per screen across every theatre/city, cycling
  // through the seeded movie list — this is what makes every seeded city
  // (not just Kolkata) actually have something playing, without hand-
  // listing 40 individual createShow calls. Only the four hand-seeded
  // movies are used here (deterministic, no network needed to seed) —
  // the much larger real-movie catalog comes from the admin's separate
  // "Populate Popular Movies" bulk-import action against OMDb (see
  // routes/admin/externalMovies.routes.ts), which needs a live API key
  // and network access the seed script can't assume it has.
  const seedMovies = [lastSignal, comedyNight, shadowsKolkata, turboChase];
  const futureShows: Awaited<ReturnType<typeof createShow>>[] = [];
  let movieCursor = 0;
  let hourCursor = 2;
  for (const t of theatreData) {
    const screens = screensByTheatreKey[t.key];
    for (const screenId of [screens.screen1, screens.screen2]) {
      const movie = seedMovies[movieCursor % seedMovies.length];
      movieCursor++;
      hourCursor += 3;
      futureShows.push(await createShow(movie.id, screenId, new Date(now.getTime() + hours(hourCursor)), movie.durationMins));
    }
  }

  // --- Historical CONFIRMED booking against the past show, so the demo
  // user can rate `lastSignal` immediately. ---
  const pastShowSeats = await prisma.seat.findMany({
    where: { layout: { screenId: metro.screen1 } },
    take: 2,
  });
  const pastSeatsSnapshot = pastShowSeats.map((s) => ({
    seatId: s.id,
    label: s.label,
    category: s.category,
    price: PRICES[s.category],
  }));
  const historicalBooking = await prisma.booking.create({
    data: {
      reference: "SHOW-PAST01",
      status: "CONFIRMED",
      showId: pastShow.id,
      userId: demoUser.id,
      totalAmount: pastSeatsSnapshot.reduce((sum, s) => sum + s.price, 0),
      seatsSnapshot: pastSeatsSnapshot,
    },
  });
  await prisma.bookingSeat.createMany({
    data: pastSeatsSnapshot.map((s) => ({
      bookingId: historicalBooking.id,
      showId: pastShow.id,
      seatId: s.seatId,
      category: s.category,
      price: s.price,
    })),
  });

  // A seed rating too, so the movie listing already shows a non-zero
  // average rating and review count.
  await prisma.rating.create({
    data: {
      movieId: lastSignal.id,
      userId: demoUser.id,
      stars: 5,
      comment: "Genuinely tense — the ending re-contextualizes the whole first act.",
    },
  });

  // --- Sample guest booking, so the README can quote a real reference
  // code + email for the "find my booking" flow. ---
  const guestShow = futureShows.find((s) => s.screenId === bandra.screen1)!; // a show at Bandra Big Screen, Mumbai
  const guestSeat = await prisma.seat.findFirst({ where: { layout: { screenId: guestShow.screenId } } });
  const guestSeatsSnapshot = [
    { seatId: guestSeat!.id, label: guestSeat!.label, category: guestSeat!.category, price: PRICES[guestSeat!.category] },
  ];
  const guestBooking = await prisma.booking.create({
    data: {
      reference: "SHOW-GUEST1",
      status: "CONFIRMED",
      showId: guestShow.id,
      guestName: "Jordan Guest",
      guestEmail: "jordan.guest@example.com",
      guestPhone: "+91-9000000000",
      totalAmount: guestSeatsSnapshot.reduce((sum, s) => sum + s.price, 0),
      seatsSnapshot: guestSeatsSnapshot,
    },
  });
  await prisma.bookingSeat.createMany({
    data: guestSeatsSnapshot.map((s) => ({
      bookingId: guestBooking.id,
      showId: guestShow.id,
      seatId: s.seatId,
      category: s.category,
      price: s.price,
    })),
  });

  console.log("\nSeed complete.\n");
  console.log("Admin login:      admin@showtime.dev / Admin123!");
  console.log("Demo user login:  demo@showtime.dev / Demo1234!");
  console.log("Guest booking:    reference=SHOW-GUEST1  email=jordan.guest@example.com");
  console.log(`Past show (rate ${lastSignal.title}): ${pastShow.id}`);
  console.log(`Cities seeded:    ${[...new Set(theatreData.map((t) => t.city))].join(", ")}`);
  console.log(`Theatres seeded:  ${theatreData.length} (${theatreData.length * 2} screens)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

import { PrismaClient, SeatCategory } from "@prisma/client";
import bcrypt from "bcrypt";
import { generateDefaultSeatLayout } from "../src/utils/seatLayoutGenerator";
import { DEFAULT_SEAT_PRICES as PRICES } from "../src/config/defaultPrices";
import { generateReferralCode } from "../src/utils/referralCode";
import { getExternalMovieByTitle } from "../src/services/externalMovieService";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding ShowTime...");

  await prisma.ratingVote.deleteMany();
  await prisma.rating.deleteMany();
  await prisma.bookingFoodItem.deleteMany();
  await prisma.walletTransaction.deleteMany();
  await prisma.bookingSeat.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.coupon.deleteMany();
  await prisma.foodItem.deleteMany();
  await prisma.waitlist.deleteMany();
  await prisma.showSeatPrice.deleteMany();
  await prisma.show.deleteMany();
  await prisma.seat.deleteMany();
  await prisma.seatLayout.deleteMany();
  await prisma.screen.deleteMany();
  await prisma.theatre.deleteMany();
  await prisma.movie.deleteMany();
  await prisma.event.deleteMany();
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
      referralCode: generateReferralCode(),
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
      referralCode: generateReferralCode(),
    },
  });
  await prisma.user.create({
    data: {
      name: "Sam Sample",
      email: "sam@showtime.dev",
      passwordHash: demoPasswordHash,
      role: "CUSTOMER",
      emailVerified: true,
      referralCode: generateReferralCode(),
    },
  });

  // --- Movies ---
  // Seeded with REAL movie data (real posters, synopses, genres, runtimes)
  // resolved live through OMDb — the same mechanism as the admin's
  // "Populate Popular Movies" bulk-import (see externalMovieService.ts
  // and curatedMovieTitles.ts), just run once here so the catalog looks
  // like a real, populated product from the very first `npm run db:seed`
  // rather than needing an admin to click "import" first. One title per
  // genre this app's demo narrative leans on (sci-fi flagship for the
  // "past show, rate it now" demo; comedy/drama/action for the rest).
  // Falls back to a hand-written placeholder if OMDb is unreachable
  // (no network, bad/missing API key) so seeding never hard-fails.
  const flagshipTitles = [
    { title: "Inception", fallbackGenre: "Sci-Fi" },
    { title: "3 Idiots", fallbackGenre: "Comedy" },
    { title: "Parasite", fallbackGenre: "Drama" },
    { title: "Mad Max: Fury Road", fallbackGenre: "Action" },
  ] as const;

  async function seedRealMovie(title: string, fallbackGenre: string) {
    try {
      const details = await getExternalMovieByTitle(title);
      if (details) {
        return prisma.movie.create({
          data: {
            title: details.title,
            description: details.overview || `${details.title} — now showing.`,
            durationMins: details.durationMins ?? 120,
            genre: details.genre,
            posterUrl: details.posterUrl,
            releaseDate: details.releaseDate ? new Date(details.releaseDate) : new Date(),
            externalId: details.externalId,
          },
        });
      }
    } catch (err) {
      console.warn(`Could not fetch "${title}" from OMDb, using a placeholder instead:`, err);
    }
    return prisma.movie.create({
      data: {
        title,
        description: `${title} — now showing.`,
        durationMins: 120,
        genre: fallbackGenre,
        posterUrl: null,
        releaseDate: new Date(),
      },
    });
  }

  // Sequential (not Promise.all) — gentle on OMDb's free-tier rate limit.
  const movies: Awaited<ReturnType<typeof seedRealMovie>>[] = [];
  for (const { title, fallbackGenre } of flagshipTitles) {
    movies.push(await seedRealMovie(title, fallbackGenre));
  }
  const [flagshipMovie, movie2, movie3, movie4] = movies;

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

  const FORMATS = ["2D", "3D", "IMAX"];
  const LANGUAGES = ["English", "Hindi", "Bengali"];

  async function createShow(
    movieId: string,
    screenId: string,
    startTime: Date,
    durationMins: number,
    format: string = "2D",
    language: string = "English",
  ) {
    const endTime = new Date(startTime.getTime() + durationMins * 60_000);
    const show = await prisma.show.create({ data: { movieId, screenId, startTime, endTime, format, language } });
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
  const pastShow = await createShow(flagshipMovie.id, metro.screen1, new Date(now.getTime() - hours(50)), flagshipMovie.durationMins);

  // One future show per screen across every theatre/city, cycling
  // through the seeded movie list — this is what makes every seeded city
  // (not just Kolkata) actually have something playing, without hand-
  // listing 40 individual createShow calls. Only the four hand-seeded
  // movies are used here (deterministic, no network needed to seed) —
  // the much larger real-movie catalog comes from the admin's separate
  // "Populate Popular Movies" bulk-import action against OMDb (see
  // routes/admin/externalMovies.routes.ts), which needs a live API key
  // and network access the seed script can't assume it has.
  const seedMovies = [flagshipMovie, movie2, movie3, movie4];
  const futureShows: Awaited<ReturnType<typeof createShow>>[] = [];
  let movieCursor = 0;
  let hourCursor = 2;
  for (const t of theatreData) {
    const screens = screensByTheatreKey[t.key];
    for (const screenId of [screens.screen1, screens.screen2]) {
      const movie = seedMovies[movieCursor % seedMovies.length];
      const format = FORMATS[movieCursor % FORMATS.length];
      const language = LANGUAGES[movieCursor % LANGUAGES.length];
      movieCursor++;
      hourCursor += 3;
      futureShows.push(
        await createShow(movie.id, screenId, new Date(now.getTime() + hours(hourCursor)), movie.durationMins, format, language),
      );
    }
  }

  // --- Events (a second bookable content type — see the `Event`/`Show`
  // comments in schema.prisma) — a small, fixed set of fictional events
  // (unlike movies, there's no free real-world "what's playing at this
  // comedy club" data source to resolve against, same reasoning as
  // theatres' seat layouts/showtimes) scheduled onto a couple of the
  // same screens already seeded above. Reuses `createShow`'s exact
  // seat-pricing logic via a thin wrapper, since a Show row for an
  // Event needs the identical ShowSeatPrice rows a movie Show does.
  async function createEventSession(eventId: string, screenId: string, startTime: Date, durationMins: number) {
    const endTime = new Date(startTime.getTime() + durationMins * 60_000);
    const session = await prisma.show.create({
      data: { kind: "EVENT", eventId, screenId, startTime, endTime },
    });
    await prisma.showSeatPrice.createMany({
      data: (Object.keys(PRICES) as SeatCategory[]).map((category) => ({
        showId: session.id,
        category,
        price: PRICES[category],
      })),
    });
    return session;
  }

  const eventData = [
    {
      title: "Live Comedy Night: Open Mic Royale",
      description: "Five stand-up comics, one stage, zero notes — a rowdy, unscripted night of new material.",
      category: "COMEDY" as const,
      durationMins: 90,
      posterUrl: null,
    },
    {
      title: "Acoustic Sessions: Under the City Lights",
      description: "An intimate acoustic concert featuring independent singer-songwriters from across the city.",
      category: "CONCERT" as const,
      durationMins: 120,
      posterUrl: null,
    },
    {
      title: "A Midsummer Night's Dream — Live on Stage",
      description: "A modern staging of Shakespeare's classic comedy, performed by a local theatre troupe.",
      category: "THEATRE_PLAY" as const,
      durationMins: 150,
      posterUrl: null,
    },
  ];
  const events = await Promise.all(eventData.map((e) => prisma.event.create({ data: e })));

  const indiranagar = screensByTheatreKey.indiranagarImax;
  const hazratganj = screensByTheatreKey.hazratganjTalkies;
  let eventHourCursor = 5;
  for (const event of events) {
    eventHourCursor += 6;
    await createEventSession(event.id, indiranagar.screen1, new Date(now.getTime() + hours(eventHourCursor)), event.durationMins);
    eventHourCursor += 6;
    await createEventSession(event.id, hazratganj.screen2, new Date(now.getTime() + hours(eventHourCursor)), event.durationMins);
  }

  // --- Historical CONFIRMED booking against the past show, so the demo
  // user can rate `flagshipMovie` immediately. ---
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
      movieId: flagshipMovie.id,
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

  // Demo coupons, so the checkout coupon field has something real to try
  // immediately without needing to create one via the admin panel first.
  await prisma.coupon.createMany({
    data: [
      { code: "WELCOME10", type: "PERCENT", value: 10, maxUses: null, active: true },
      { code: "FLAT50", type: "FLAT", value: 50, maxUses: 100, active: true },
    ],
  });

  // Demo F&B menu, so the checkout food step has real items to add
  // immediately without needing to create any via the admin panel first.
  await prisma.foodItem.createMany({
    data: [
      { name: "Regular Popcorn", description: "Salted popcorn, regular tub", price: 180, category: "SNACK" },
      { name: "Large Popcorn", description: "Salted popcorn, large tub", price: 280, category: "SNACK" },
      { name: "Nachos with Cheese Dip", description: "Crispy nachos with cheese dip", price: 220, category: "SNACK" },
      { name: "Coca-Cola (Regular)", description: "500ml", price: 120, category: "DRINK" },
      { name: "Coca-Cola (Large)", description: "750ml", price: 160, category: "DRINK" },
      { name: "Mineral Water", description: "1L bottle", price: 60, category: "DRINK" },
      {
        name: "Popcorn + Coke Combo",
        description: "Regular popcorn with a regular Coca-Cola",
        price: 260,
        category: "COMBO",
      },
    ],
  });

  console.log("\nSeed complete.\n");
  console.log("Admin login:      admin@showtime.dev / Admin123!");
  console.log("Demo user login:  demo@showtime.dev / Demo1234!");
  console.log("Guest booking:    reference=SHOW-GUEST1  email=jordan.guest@example.com");
  console.log(`Past show (rate ${flagshipMovie.title}): ${pastShow.id}`);
  console.log(`Cities seeded:    ${[...new Set(theatreData.map((t) => t.city))].join(", ")}`);
  console.log(`Theatres seeded:  ${theatreData.length} (${theatreData.length * 2} screens)`);
  console.log("Demo coupons:     WELCOME10 (10% off), FLAT50 (₹50 off, max 100 uses)");
  console.log("Demo food items:  7 snacks/drinks/combos");
  console.log(`Demo events:      ${events.length} (comedy/concert/theatre), 2 sessions each`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

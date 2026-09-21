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
  const samUser = await prisma.user.create({
    data: {
      name: "Sam Sample",
      email: "sam@showtime.dev",
      passwordHash: demoPasswordHash,
      role: "CUSTOMER",
      emailVerified: true,
      referralCode: generateReferralCode(),
    },
  });
  const priyaUser = await prisma.user.create({
    data: {
      name: "Priya Patel",
      email: "priya@showtime.dev",
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
  // rather than needing an admin to click "import" first — a genuinely
  // varied ~20-title catalog (mixing Hollywood and Bollywood, several
  // genres) instead of just 4, so the home page's search/genre filters
  // and the city-by-city show schedule below both have real breadth to
  // demonstrate. Falls back to a hand-written placeholder per-title if
  // OMDb is unreachable (no network, bad/missing API key) so seeding
  // never hard-fails. "Inception" stays first — it's the flagship used
  // for the "past show, rate it now" demo below.
  const flagshipTitles = [
    { title: "Inception", fallbackGenre: "Sci-Fi" },
    { title: "3 Idiots", fallbackGenre: "Comedy" },
    { title: "Parasite", fallbackGenre: "Drama" },
    { title: "Mad Max: Fury Road", fallbackGenre: "Action" },
    { title: "The Dark Knight", fallbackGenre: "Action" },
    { title: "Interstellar", fallbackGenre: "Sci-Fi" },
    { title: "Dangal", fallbackGenre: "Drama" },
    { title: "Gully Boy", fallbackGenre: "Drama" },
    { title: "Spider-Man: No Way Home", fallbackGenre: "Action" },
    { title: "Oppenheimer", fallbackGenre: "Drama" },
    { title: "Barbie", fallbackGenre: "Comedy" },
    { title: "La La Land", fallbackGenre: "Musical" },
    { title: "Whiplash", fallbackGenre: "Drama" },
    { title: "Joker", fallbackGenre: "Drama" },
    { title: "Dune", fallbackGenre: "Sci-Fi" },
    { title: "Top Gun: Maverick", fallbackGenre: "Action" },
    { title: "John Wick", fallbackGenre: "Action" },
    { title: "Zindagi Na Milegi Dobara", fallbackGenre: "Comedy" },
    { title: "Andhadhun", fallbackGenre: "Thriller" },
    { title: "Coco", fallbackGenre: "Animation" },
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
  const [flagshipMovie] = movies;

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
  // Real-world coordinates (approximate city centers, with a small
  // per-theatre offset so two theatres in the same city aren't at the
  // literal same point) — this is what powers "nearest theatre" (see
  // locationService.ts's `findNearestServiceableCities`): a real
  // distance calculation needs real coordinates, not just a city name.
  const theatreData = [
    { key: "metroCineplex", name: "Metro Cineplex", city: "Kolkata", address: "12 Park Street, Kolkata", lat: 22.5726, lon: 88.3639 },
    { key: "riversideMultiplex", name: "Riverside Multiplex", city: "Kolkata", address: "45 Riverside Road, Kolkata", lat: 22.5850, lon: 88.3468 },
    { key: "bandraBigScreen", name: "Bandra Big Screen", city: "Mumbai", address: "8 Linking Road, Bandra West, Mumbai", lat: 19.0596, lon: 72.8295 },
    { key: "andheriCineworld", name: "Andheri Cineworld", city: "Mumbai", address: "Andheri West, Mumbai", lat: 19.1197, lon: 72.8468 },
    { key: "connaughtCinemaHub", name: "Connaught Cinema Hub", city: "Delhi", address: "21 Connaught Place, New Delhi", lat: 28.6315, lon: 77.2167 },
    { key: "saketSelectScreens", name: "Saket Select Screens", city: "Delhi", address: "Saket, New Delhi", lat: 28.5245, lon: 77.2066 },
    { key: "indiranagarImax", name: "Indiranagar IMAX", city: "Bangalore", address: "100 Ft Road, Indiranagar, Bangalore", lat: 12.9719, lon: 77.6412 },
    { key: "whitefieldMultiplex", name: "Whitefield Multiplex", city: "Bangalore", address: "Whitefield, Bangalore", lat: 12.9698, lon: 77.7500 },
    { key: "marinaMovieHouse", name: "Marina Movie House", city: "Chennai", address: "Marina Beach Road, Chennai", lat: 13.0500, lon: 80.2824 },
    { key: "tNagarTalkies", name: "T Nagar Talkies", city: "Chennai", address: "T Nagar, Chennai", lat: 13.0418, lon: 80.2341 },
    { key: "hitechCityCinemas", name: "Hitech City Cinemas", city: "Hyderabad", address: "Hitech City, Hyderabad", lat: 17.4483, lon: 78.3915 },
    { key: "banjaraHillsScreens", name: "Banjara Hills Screens", city: "Hyderabad", address: "Banjara Hills, Hyderabad", lat: 17.4156, lon: 78.4347 },
    { key: "koregaonParkCinema", name: "Koregaon Park Cinema", city: "Pune", address: "Koregaon Park, Pune", lat: 18.5362, lon: 73.8940 },
    { key: "vimanNagarMultiplex", name: "Viman Nagar Multiplex", city: "Pune", address: "Viman Nagar, Pune", lat: 18.5679, lon: 73.9143 },
    { key: "sgHighwayScreens", name: "SG Highway Screens", city: "Ahmedabad", address: "SG Highway, Ahmedabad", lat: 23.0304, lon: 72.5066 },
    { key: "navrangpuraCinema", name: "Navrangpura Cinema", city: "Ahmedabad", address: "Navrangpura, Ahmedabad", lat: 23.0367, lon: 72.5601 },
    { key: "miRoadMovieHouse", name: "MI Road Movie House", city: "Jaipur", address: "MI Road, Jaipur", lat: 26.9157, lon: 75.8079 },
    { key: "malviyaNagarCinemas", name: "Malviya Nagar Cinemas", city: "Jaipur", address: "Malviya Nagar, Jaipur", lat: 26.8535, lon: 75.8078 },
    { key: "hazratganjTalkies", name: "Hazratganj Talkies", city: "Lucknow", address: "Hazratganj, Lucknow", lat: 26.8508, lon: 80.9462 },
    { key: "gomtiNagarScreens", name: "Gomti Nagar Screens", city: "Lucknow", address: "Gomti Nagar, Lucknow", lat: 26.8503, lon: 81.0161 },
    // A smaller, real West Bengal town — deliberately added so "use my
    // location" from an even smaller, unserviceable nearby town (e.g.
    // Bethuadahari, ~15km north) has a real, close, serviceable city to
    // resolve to, rather than jumping all the way to Kolkata.
    { key: "krishnanagarCineHub", name: "Krishnanagar Cine Hub", city: "Krishnanagar", address: "Ghurni Road, Krishnanagar", lat: 23.4058, lon: 88.5017 },
    { key: "nadiaMovieHouse", name: "Nadia Movie House", city: "Krishnanagar", address: "Station Road, Krishnanagar", lat: 23.3987, lon: 88.4954 },
  ] as const;

  const screensByTheatreKey: Record<string, { screen1: string; screen2: string }> = {};
  for (const t of theatreData) {
    const theatre = await prisma.theatre.create({
      data: { name: t.name, city: t.city, address: t.address, lat: t.lat, lon: t.lon },
    });
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
  // through the full ~20-movie seeded list — this is what makes every
  // seeded city (not just Kolkata) actually have something playing,
  // without hand-listing dozens of individual createShow calls. An even
  // larger real-movie catalog is still available via the admin's
  // separate "Populate Popular Movies" bulk-import action against OMDb
  // (~65 titles — see routes/admin/externalMovies.routes.ts) for anyone
  // who wants more than what's seeded by default.
  const seedMovies = movies;
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
    {
      title: "City Premier League: Finals Night",
      description: "The season-ending showdown between the top two teams, screened live with a full commentary crew.",
      category: "SPORTS" as const,
      durationMins: 180,
      posterUrl: null,
    },
    {
      title: "Improv & Sketch Comedy Jam",
      description: "A fully improvised sketch show — every scene built live from audience suggestions.",
      category: "COMEDY" as const,
      durationMins: 75,
      posterUrl: null,
    },
    {
      title: "Weekend Watercolor Workshop",
      description: "A hands-on painting workshop for beginners — all materials included, no experience needed.",
      category: "WORKSHOP" as const,
      durationMins: 180,
      posterUrl: null,
    },
  ];
  const events = await Promise.all(eventData.map((e) => prisma.event.create({ data: e })));

  // Spread sessions across several screens (not just two) for variety —
  // includes Krishnanagar, so a small-town visitor has real events to
  // find nearby too, not just theatres.
  const eventScreenKeys = [
    "indiranagarImax",
    "hazratganjTalkies",
    "krishnanagarCineHub",
    "marinaMovieHouse",
    "koregaonParkCinema",
    "sgHighwayScreens",
  ] as const;
  let eventHourCursor = 5;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const screens = screensByTheatreKey[eventScreenKeys[i % eventScreenKeys.length]];
    eventHourCursor += 6;
    await createEventSession(event.id, screens.screen1, new Date(now.getTime() + hours(eventHourCursor)), event.durationMins);
    eventHourCursor += 6;
    await createEventSession(event.id, screens.screen2, new Date(now.getTime() + hours(eventHourCursor)), event.durationMins);
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

  // Seed ratings — three, from three different users, with genuinely
  // mixed sentiment (not all 5-star) — so the movie listing shows a
  // real average/count AND the AI review-summary feature
  // (reviewSummaryService.ts, which needs at least 3 real comments to
  // have enough signal to summarize) works immediately on a fresh
  // seed, instead of only ever activating once real users happen to
  // leave enough reviews on the same title.
  await prisma.rating.createMany({
    data: [
      {
        movieId: flagshipMovie.id,
        userId: demoUser.id,
        stars: 5,
        comment: "Genuinely tense — the ending re-contextualizes the whole first act.",
      },
      {
        movieId: flagshipMovie.id,
        userId: samUser.id,
        stars: 4,
        comment: "Visually incredible, though the middle act dragged a bit for me.",
      },
      {
        movieId: flagshipMovie.id,
        userId: priyaUser.id,
        stars: 3,
        comment: "Great concept but I found it more confusing than clever on a first watch.",
      },
    ],
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
  console.log(`Demo events:      ${events.length} (comedy/concert/theatre/sports/workshop), 2 sessions each`);
  console.log(`AI features:      3 seeded reviews on ${flagshipMovie.title} so the AI summary works immediately`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

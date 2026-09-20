import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import { env } from "./config/env";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";

import authRoutes from "./routes/auth.routes";
import movieRoutes from "./routes/movies.routes";
import eventRoutes from "./routes/events.routes";
import theatreRoutes from "./routes/theatres.routes";
import showRoutes from "./routes/shows.routes";
import seatRoutes from "./routes/seats.routes";
import bookingRoutes from "./routes/bookings.routes";
import ratingRoutes from "./routes/ratings.routes";
import locationRoutes from "./routes/location.routes";
import waitlistRoutes from "./routes/waitlist.routes";
import foodItemRoutes from "./routes/foodItems.routes";
import walletRoutes from "./routes/wallet.routes";
import giftCardRoutes from "./routes/giftCards.routes";
import offersRoutes from "./routes/offers.routes";
import donationsRoutes from "./routes/donations.routes";

import adminAuthRoutes from "./routes/admin/auth.routes";
import adminMovieRoutes from "./routes/admin/movies.routes";
import adminEventRoutes from "./routes/admin/events.routes";
import adminEventSessionRoutes from "./routes/admin/eventSessions.routes";
import adminTheatreRoutes from "./routes/admin/theatres.routes";
import adminLayoutRoutes from "./routes/admin/layouts.routes";
import adminShowRoutes from "./routes/admin/shows.routes";
import adminBookingRoutes from "./routes/admin/bookings.routes";
import adminRatingRoutes from "./routes/admin/ratings.routes";
import adminExternalMovieRoutes from "./routes/admin/externalMovies.routes";
import adminTheatreDiscoveryRoutes from "./routes/admin/theatreDiscovery.routes";
import adminCouponRoutes from "./routes/admin/coupons.routes";
import adminFoodItemRoutes from "./routes/admin/foodItems.routes";
import adminAnalyticsRoutes from "./routes/admin/analytics.routes";
import adminGiftCardRoutes from "./routes/admin/giftCards.routes";

export function createApp() {
  const app = express();

  // `contentSecurityPolicy`/COEP/CORP disabled: those headers govern how a
  // BROWSER renders a document/loads sub-resources, which matters for an
  // app serving HTML — this is a pure JSON API, every response is read via
  // fetch/XHR from the two frontends, never rendered as a document or
  // loaded as an <img>/<script> src. Helmet's other defaults (X-Content-
  // Type-Options, X-Frame-Options, etc.) still apply — those are cheap,
  // real hardening even for a JSON API (e.g. blocking a response from
  // ever being framed or MIME-sniffed).
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(compression());
  if (env.nodeEnv === "development") app.use(morgan("dev"));

  // `maxAge` matters more than it looks: every request from the
  // frontend carries a custom `X-Session-Id` header (see api.ts's
  // `prepareHeaders`), which isn't a CORS-safelisted header — so
  // WITHOUT `maxAge`, the browser sends a fresh `OPTIONS` preflight
  // before every single GET/POST, doubling the round-trips for
  // literally every API call (visible as an `OPTIONS ... 204` line
  // right before every real request in the dev server log). `maxAge`
  // tells the browser it can cache that preflight's result and skip
  // re-asking for this long — real browsers cap it further regardless
  // (Chrome ~2h, Firefox 24h), so the seconds value here is a ceiling,
  // not a guarantee.
  app.use(cors({ origin: [env.webOrigin, env.adminOrigin], credentials: true, maxAge: 86400 }));
  app.use(express.json());
  app.use(cookieParser());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRoutes);
  app.use("/api/movies", movieRoutes);
  app.use("/api/events", eventRoutes);
  app.use("/api/theatres", theatreRoutes);
  app.use("/api/shows", showRoutes); // /api/shows/:showId/seatmap
  app.use("/api/seats", seatRoutes); // /api/seats/hold, /api/seats/release
  app.use("/api/bookings", bookingRoutes);
  app.use("/api/ratings", ratingRoutes);
  app.use("/api/locations", locationRoutes);
  app.use("/api/waitlist", waitlistRoutes);
  app.use("/api/food-items", foodItemRoutes);
  app.use("/api/wallet", walletRoutes);
  app.use("/api/gift-cards", giftCardRoutes);
  app.use("/api/offers", offersRoutes);
  app.use("/api/donations", donationsRoutes);

  app.use("/api/admin/auth", adminAuthRoutes);
  app.use("/api/admin/movies", adminMovieRoutes);
  app.use("/api/admin/events", adminEventRoutes);
  app.use("/api/admin/event-sessions", adminEventSessionRoutes);
  app.use("/api/admin/theatres", adminTheatreRoutes);
  app.use("/api/admin/layouts", adminLayoutRoutes);
  app.use("/api/admin/shows", adminShowRoutes);
  app.use("/api/admin/bookings", adminBookingRoutes);
  app.use("/api/admin/ratings", adminRatingRoutes);
  app.use("/api/admin/external-movies", adminExternalMovieRoutes);
  app.use("/api/admin/theatre-discovery", adminTheatreDiscoveryRoutes);
  app.use("/api/admin/coupons", adminCouponRoutes);
  app.use("/api/admin/food-items", adminFoodItemRoutes);
  app.use("/api/admin/analytics", adminAnalyticsRoutes);
  app.use("/api/admin/gift-cards", adminGiftCardRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

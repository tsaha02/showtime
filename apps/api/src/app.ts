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
import theatreRoutes from "./routes/theatres.routes";
import showRoutes from "./routes/shows.routes";
import seatRoutes from "./routes/seats.routes";
import bookingRoutes from "./routes/bookings.routes";
import ratingRoutes from "./routes/ratings.routes";
import locationRoutes from "./routes/location.routes";

import adminAuthRoutes from "./routes/admin/auth.routes";
import adminMovieRoutes from "./routes/admin/movies.routes";
import adminTheatreRoutes from "./routes/admin/theatres.routes";
import adminLayoutRoutes from "./routes/admin/layouts.routes";
import adminShowRoutes from "./routes/admin/shows.routes";
import adminBookingRoutes from "./routes/admin/bookings.routes";
import adminRatingRoutes from "./routes/admin/ratings.routes";
import adminExternalMovieRoutes from "./routes/admin/externalMovies.routes";
import adminTheatreDiscoveryRoutes from "./routes/admin/theatreDiscovery.routes";

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

  app.use(cors({ origin: [env.webOrigin, env.adminOrigin], credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRoutes);
  app.use("/api/movies", movieRoutes);
  app.use("/api/theatres", theatreRoutes);
  app.use("/api/shows", showRoutes); // /api/shows/:showId/seatmap
  app.use("/api/seats", seatRoutes); // /api/seats/hold, /api/seats/release
  app.use("/api/bookings", bookingRoutes);
  app.use("/api/ratings", ratingRoutes);
  app.use("/api/locations", locationRoutes);

  app.use("/api/admin/auth", adminAuthRoutes);
  app.use("/api/admin/movies", adminMovieRoutes);
  app.use("/api/admin/theatres", adminTheatreRoutes);
  app.use("/api/admin/layouts", adminLayoutRoutes);
  app.use("/api/admin/shows", adminShowRoutes);
  app.use("/api/admin/bookings", adminBookingRoutes);
  app.use("/api/admin/ratings", adminRatingRoutes);
  app.use("/api/admin/external-movies", adminExternalMovieRoutes);
  app.use("/api/admin/theatre-discovery", adminTheatreDiscoveryRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

import { Router } from "express";
import rateLimit from "express-rate-limit";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { getIndiaCities, reverseGeocodeCity, findNearestServiceableCities } from "../services/locationService";

const router = Router();

const locationRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60 });

router.get(
  "/india-cities",
  locationRateLimit,
  asyncHandler(async (_req, res) => {
    const cities = await getIndiaCities();
    res.json({ cities });
  }),
);

router.get(
  "/reverse-geocode",
  locationRateLimit,
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw ApiError.badRequest("Query parameters 'lat' and 'lon' must be numbers");
    }
    const city = await reverseGeocodeCity(lat, lon);
    res.json({ city });
  }),
);

// "You're in Bethuadahari, which we don't serve — but Krishnanagar
// (18km away) is." Computed from real theatre coordinates, not a
// static city-distance table — see locationService.ts's comment on
// `findNearestServiceableCities` for why.
router.get(
  "/nearest-cities",
  locationRateLimit,
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw ApiError.badRequest("Query parameters 'lat' and 'lon' must be numbers");
    }
    const nearest = await findNearestServiceableCities(lat, lon);
    res.json({ nearest });
  }),
);

export default router;

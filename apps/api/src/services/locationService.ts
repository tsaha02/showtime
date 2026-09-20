import { redis } from "../lib/redis";
import { ApiError } from "../utils/ApiError";

// Two genuinely free, keyless public APIs, used for two different jobs:
//
// 1. countriesnow.space — a real, comprehensive list of Indian cities/
//    towns (thousands of them), for the city picker's search box. This
//    is real, live-fetched data — unlike theatre/screen/show data (see
//    README's "why theatre data can't be 'live'"), a plain list of city
//    NAMES is exactly the kind of thing a free public geo API can and
//    does provide with no commercial licensing involved.
// 2. nominatim.openstreetmap.org — OpenStreetMap's free reverse-geocoding
//    service, used to turn a browser's `navigator.geolocation` lat/lng
//    into a city name. Its usage policy requires a real User-Agent
//    identifying the calling application and caps usage at roughly 1
//    request/second — both are naturally satisfied here since it's only
//    called once per user click on "Use my location," from the server
//    (not the browser directly — avoids CORS and keeps the required
//    User-Agent centralized in one place).
//
// Neither of these ever claims to know which of these cities ShowTime
// actually has theatres in — that's still the separate, curated
// `GET /api/theatres/cities` list. This service answers "what cities
// exist," not "what cities can you book in."

const CITIES_CACHE_KEY = "location:india-cities";
const CITIES_CACHE_TTL_SECONDS = 60 * 60 * 24; // 24h — a country's city list doesn't change day to day

export async function getIndiaCities(): Promise<string[]> {
  const cached = await redis.get(CITIES_CACHE_KEY);
  if (cached) return JSON.parse(cached);

  let res: Response;
  try {
    res = await fetch("https://countriesnow.space/api/v0.1/countries/cities/q?country=india");
  } catch (err) {
    throw ApiError.internal(
      `Could not reach the city-data API (network error: ${err instanceof Error ? err.message : String(err)}).`,
    );
  }
  if (!res.ok) throw ApiError.internal(`City-data API request failed with HTTP status ${res.status}`);

  const data = (await res.json()) as { error: boolean; msg?: string; data?: string[] };
  if (data.error || !data.data) throw ApiError.internal(data.msg || "City-data API returned an error");

  const cities = [...new Set(data.data)].sort();
  await redis.set(CITIES_CACHE_KEY, JSON.stringify(cities), "EX", CITIES_CACHE_TTL_SECONDS);
  return cities;
}

export async function reverseGeocodeCity(lat: number, lon: number): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`, {
      headers: { "User-Agent": "ShowTime/1.0 (portfolio project; local dev)" },
    });
  } catch (err) {
    throw ApiError.internal(
      `Could not reach the reverse-geocoding API (network error: ${err instanceof Error ? err.message : String(err)}).`,
    );
  }
  if (!res.ok) throw ApiError.internal(`Reverse-geocoding API request failed with HTTP status ${res.status}`);

  const data = (await res.json()) as {
    address?: { city?: string; town?: string; state_district?: string; county?: string };
  };
  const address = data.address;
  if (!address) return null;
  // Fall back through increasingly coarse fields — a rural coordinate
  // may not have a `city`, but usually has SOME administrative area name.
  return address.city ?? address.town ?? address.state_district ?? address.county ?? null;
}

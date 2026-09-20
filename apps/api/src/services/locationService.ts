import { redis } from "../lib/redis";
import { prisma } from "../lib/prisma";
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

// Great-circle distance in kilometers — the standard formula, no
// external geo library needed for this project's scale (a few dozen
// theatres, one distance computation per "use my location" click).
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface NearestCity {
  city: string;
  distanceKm: number;
}

// Answers "which of ShowTime's SERVICEABLE cities is physically closest
// to this point" — the missing piece that made "use my location" a
// dead end for anyone not standing in one of the exact serviceable
// cities: reverse-geocoding a rural/small-town coordinate correctly
// returns that town's own name (e.g. "Bethuadahari"), which is never
// going to exactly match a city ShowTime has theatres in. Distance to
// the nearest REAL theatre (not a city-centroid lookup table) is what
// actually answers "where should I go to catch a movie," so this
// reduces over every theatre with known coordinates rather than a
// separate, hand-maintained city-coordinate table that could drift out
// of sync with which cities actually have theatres.
export async function findNearestServiceableCities(lat: number, lon: number, limit = 3): Promise<NearestCity[]> {
  const theatres = await prisma.theatre.findMany({
    where: { lat: { not: null }, lon: { not: null } },
    select: { city: true, lat: true, lon: true },
  });

  const nearestPerCity = new Map<string, number>();
  for (const t of theatres) {
    const distanceKm = haversineKm(lat, lon, t.lat!, t.lon!);
    const existing = nearestPerCity.get(t.city);
    if (existing === undefined || distanceKm < existing) nearestPerCity.set(t.city, distanceKm);
  }

  return [...nearestPerCity.entries()]
    .map(([city, distanceKm]) => ({ city, distanceKm: Math.round(distanceKm * 10) / 10 }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

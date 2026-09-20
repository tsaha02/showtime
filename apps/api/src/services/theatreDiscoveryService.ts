import { ApiError } from "../utils/ApiError";

// Real cinema locations via OpenStreetMap (OSM) — free and open (ODbL
// license), unlike showtime/scheduling data, which no free source
// publishes anywhere (see the comment on the `Show` model). This is used
// ONLY by the admin "Import real theatres" flow: an admin searches a
// city, picks a real result (often a real chain — PVR, INOX, Cinépolis
// — or a real independent cinema), and it creates a local `Theatre` row
// with that real name/address. Screens, seat layout, and pricing are
// still admin-configured afterward (via the existing seat-layout editor
// and show-creation flow) — OSM has no opinion on any of that, only on
// "a cinema exists at this location, and here's its name."
//
// Two free, keyless OpenStreetMap services are chained together:
//   1. Nominatim (geocoding) turns a city name into a bounding box —
//      more robust than asking Overpass to match an "area name" exactly,
//      which is fragile (e.g. "Bangalore" vs OSM's "Bengaluru").
//   2. Overpass (the OSM query API) finds every node tagged
//      `amenity=cinema` within that bounding box.
// Overpass is a shared, rate-limited community server — occasional
// slowness or transient empty responses are a known characteristic of
// the free public instance, not a bug in this integration; errors here
// are surfaced clearly rather than silently swallowed.

export interface DiscoveredTheatre {
  osmId: string;
  name: string;
  address: string | null;
  lat: number;
  lon: number;
}

async function geocodeCityBoundingBox(city: string): Promise<[south: number, west: number, north: number, east: number]> {
  let res: Response;
  try {
    res = await fetch(
      `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}&country=India&format=json&limit=1`,
      { headers: { "User-Agent": "ShowTime/1.0 (portfolio project; local dev)" } },
    );
  } catch (err) {
    throw ApiError.internal(
      `Could not reach the geocoding API (network error: ${err instanceof Error ? err.message : String(err)}).`,
    );
  }
  if (!res.ok) throw ApiError.internal(`Geocoding API request failed with HTTP status ${res.status}`);

  const results = (await res.json()) as Array<{ boundingbox: [string, string, string, string] }>;
  if (results.length === 0) throw ApiError.badRequest(`Could not find a location for city "${city}"`);

  const [south, north, west, east] = results[0].boundingbox.map(Number);
  return [south, west, north, east];
}

interface OverpassElement {
  type: string;
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

function addressFromTags(tags: Record<string, string> | undefined): string | null {
  if (!tags) return null;
  const parts = [tags["addr:housename"], tags["addr:street"], tags["addr:city"]].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export async function searchNearbyRealTheatres(city: string): Promise<DiscoveredTheatre[]> {
  const [south, west, north, east] = await geocodeCityBoundingBox(city);

  let res: Response;
  try {
    res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: `data=${encodeURIComponent(
        `[out:json][timeout:20];node["amenity"="cinema"](${south},${west},${north},${east});out body 40;`,
      )}`,
      // Overpass's server (like Nominatim's) rejects requests with no
      // real User-Agent — confirmed directly against the live API, not
      // a guess: an identical request with only the default fetch
      // headers gets a 406 from Apache's content negotiation.
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "ShowTime/1.0 (portfolio project; local dev)",
        Accept: "*/*",
      },
    });
  } catch (err) {
    throw ApiError.internal(
      `Could not reach OpenStreetMap's Overpass API (network error: ${err instanceof Error ? err.message : String(err)}). This is a shared free community server and is occasionally slow or unavailable — try again in a moment.`,
    );
  }
  if (!res.ok) {
    throw ApiError.internal(
      `Overpass API request failed with HTTP status ${res.status}. This is a shared free community server — it may be temporarily rate-limiting or overloaded; try again shortly.`,
    );
  }

  const data = (await res.json()) as { elements: OverpassElement[] };
  return data.elements
    .filter((e) => e.tags?.name)
    .map((e) => ({
      osmId: `${e.type}/${e.id}`,
      name: e.tags!.name,
      address: addressFromTags(e.tags),
      lat: e.lat,
      lon: e.lon,
    }));
}

// Regenerates the hardcoded floor GeoJSON in src/data/bmich-floors.json from
// the Blicq public API's venue details for the book-fair exhibition. A
// development helper only: the app imports that file directly (compiled into
// the bundle) and makes no requests at runtime.
//
//   npm run export-floors
//
// Env overrides: API_BASE_URL (default https://api.lab.blicq.net/v1),
// EXHIBITION_ID (default: Colombo International Book Fair 2026 at BMICH).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const apiBase = (process.env.API_BASE_URL ?? "https://api.lab.blicq.net/v1").replace(/\/$/, "");
const exhibitionId = process.env.EXHIBITION_ID ?? "f125ab2f-46de-4dc0-af9f-0e0d717df564";
const url = `${apiBase}/public/exhibitions/${exhibitionId}/venue-details`;

const res = await fetch(url);
if (!res.ok) {
  console.error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const venue = await res.json();

// Only what the map needs — the response also carries every stall with its
// business details, which the app doesn't use.
const data = {
  venue: { id: venue.id, name: venue.name, latitude: venue.latitude, longitude: venue.longitude },
  floors: venue.floors
    .filter((f) => f.json?.type === "FeatureCollection")
    .map((f) => ({ id: f.id, name: f.name, geojson: f.json })),
};

const file = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", "bmich-floors.json");
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(data) + "\n");

const features = data.floors.reduce((n, f) => n + f.geojson.features.length, 0);
console.log(`Wrote ${data.floors.length} floors (${features} features) for ${data.venue.name} to ${file}`);

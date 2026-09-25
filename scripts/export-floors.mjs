// Regenerates the hardcoded floor GeoJSON in src/data/<slug>-floors.json from
// the local Blicq Postgres (Docker). A development helper only: the app
// imports that file directly (compiled into the bundle) and never talks to
// the database or any API.
//
//   npm run export-floors                 # BMICH, from container blicq-postgres
//   npm run export-floors -- "Venue name" # another venue
//
// Env overrides: PG_CONTAINER (default blicq-postgres), PG_USER (postgres),
// PG_DB (blicq1).

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const venueName = process.argv[2] ?? "BMICH";
const container = process.env.PG_CONTAINER ?? "blicq-postgres";
const user = process.env.PG_USER ?? "postgres";
const db = process.env.PG_DB ?? "blicq1";

// Single-quoted SQL literal, so a venue name can't break out of the query.
const literal = `'${venueName.replace(/'/g, "''")}'`;

// Soft-deleted floors are skipped (BMICH has an old deleted copy of Hall-D).
const sql = `
select json_build_object(
  'venue', json_build_object('id', v.id, 'name', v.name, 'latitude', v.latitude, 'longitude', v.longitude),
  'floors', coalesce((
    select json_agg(json_build_object('id', f.id, 'name', f.name, 'geojson', f.json) order by f.name)
    from venue_floors f
    where f.venue_id = v.id and f.deleted_at is null
  ), '[]'::json)
)
from venues v
where v.name = ${literal} and v.deleted_at is null
limit 1;`;

const out = execFileSync("docker", ["exec", "-i", container, "psql", "-U", user, "-d", db, "-At", "-c", sql], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
}).trim();

if (!out) {
  console.error(`No venue named "${venueName}" in ${db}.`);
  process.exit(1);
}

const data = JSON.parse(out);
const slug = venueName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const file = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data", `${slug}-floors.json`);
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(data) + "\n");

const features = data.floors.reduce((n, f) => n + (f.geojson?.features?.length ?? 0), 0);
console.log(`Wrote ${data.floors.length} floors (${features} features) for ${data.venue.name} to ${file}`);

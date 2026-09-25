import type { Feature, FeatureCollection, Geometry, Point, Position } from "geojson";
import bmichFloors from "@/data/bmich-floors.json";

/** Shape of the hardcoded floor data (regenerate with npm run export-floors). */
export type VenueFloorsFile = {
  venue: { id: string; name: string; latitude: number; longitude: number };
  floors: { id: string; name: string; geojson: FeatureCollection }[];
};

/** BMICH's floor plans, compiled into the app — nothing is fetched at runtime. */
export const BMICH_FLOORS = bmichFloors as unknown as VenueFloorsFile;

/** Every floor's features in one collection, each tagged with its floor name
 * so the map can style and label them together. */
export function allFeatures(file: VenueFloorsFile): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: file.floors.flatMap((floor) =>
      floor.geojson.features.map((f) => ({ ...f, properties: { ...f.properties, floor: floor.name } }))
    ),
  };
}

function positionsOf(geometry: Geometry): Position[] {
  switch (geometry.type) {
    case "Point":
      return [geometry.coordinates];
    case "MultiPoint":
    case "LineString":
      return geometry.coordinates;
    case "MultiLineString":
    case "Polygon":
      return geometry.coordinates.flat();
    case "MultiPolygon":
      return geometry.coordinates.flat(2);
    case "GeometryCollection":
      return geometry.geometries.flatMap(positionsOf);
  }
}

/** One label point per floor, at the middle of its bounding box. */
export function floorLabels(file: VenueFloorsFile): FeatureCollection<Point> {
  const features: Feature<Point>[] = [];
  for (const floor of file.floors) {
    const pts = floor.geojson.features.flatMap((f) => (f.geometry ? positionsOf(f.geometry) : []));
    if (pts.length === 0) continue;
    const lngs = pts.map((p) => p[0]);
    const lats = pts.map((p) => p[1]);
    features.push({
      type: "Feature",
      properties: { name: floor.name },
      geometry: {
        type: "Point",
        coordinates: [(Math.min(...lngs) + Math.max(...lngs)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2],
      },
    });
  }
  return { type: "FeatureCollection", features };
}

/** Every distinct corner of every feature — the exact coordinates a pin can
 * snap to. Closing points of rings duplicate the first, so they're dropped. */
export function allVertices(file: VenueFloorsFile): [number, number][] {
  const seen = new Set<string>();
  const out: [number, number][] = [];
  for (const floor of file.floors) {
    for (const f of floor.geojson.features) {
      if (!f.geometry) continue;
      for (const p of positionsOf(f.geometry)) {
        const key = `${p[0]},${p[1]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push([p[0], p[1]]);
      }
    }
  }
  return out;
}

function inRing(lng: number, lat: number, ring: Position[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPolygon(lng: number, lat: number, rings: Position[][]) {
  return inRing(lng, lat, rings[0]) && !rings.slice(1).some((hole) => inRing(lng, lat, hole));
}

/** The name of the floor whose polygons contain the point, if any. A point
 * exactly on a corner (a snapped pin) sits on the polygon's edge, which the
 * inside test doesn't count, so corners are matched to their floor directly. */
export function floorAt(file: VenueFloorsFile, lng: number, lat: number): string | null {
  for (const floor of file.floors) {
    for (const f of floor.geojson.features) {
      const g = f.geometry;
      if (g?.type === "Polygon" && inPolygon(lng, lat, g.coordinates)) return floor.name;
      if (g?.type === "MultiPolygon" && g.coordinates.some((poly) => inPolygon(lng, lat, poly))) return floor.name;
    }
  }
  for (const floor of file.floors) {
    for (const f of floor.geojson.features) {
      if (f.geometry && positionsOf(f.geometry).some((p) => p[0] === lng && p[1] === lat)) return floor.name;
    }
  }
  return null;
}

"use client";

import { useEffect, useMemo, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Feature, Polygon } from "geojson";
import type { Fix } from "@/lib/useLiveLocation";
import { allFeatures, allVertices, floorLabels, type VenueFloorsFile } from "@/lib/floors";
import type { Pin } from "@/lib/pins";

// Same Mapbox style as the Blicq exhibition web app.
const MAPBOX_STYLE = "mapbox://styles/mevinu/cmqhxruko000201s2g9g864fk";
const FIX_ZOOM = 17;
const ACCURACY_SOURCE = "accuracy";
const FLOORS_SOURCE = "floors";
const FLOOR_LABELS_SOURCE = "floor-labels";
/** Building-level detail; Mapbox's own ceiling. */
const MAX_ZOOM = 22;
/** How close (in screen pixels) the crosshair must be to a floor-plan corner to snap to it. */
const SNAP_PX = 14;

export type CrosshairPoint = { latitude: number; longitude: number; snapped: boolean };

/** A point to move the map to — `key` changes to re-trigger the same point. */
export type MapFocus = { latitude: number; longitude: number; zoom?: number; key: number };

/** A circle of `radius` metres around a point, as a GeoJSON polygon — the
 * shaded area the device could actually be in. */
function accuracyCircle(lng: number, lat: number, radius: number): Feature<Polygon> {
  const points = 64;
  const dLat = radius / 111_320;
  const dLng = radius / (111_320 * Math.cos((lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(t), lat + dLat * Math.sin(t)]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

function pinElement(pin: Pin) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "locator-pin";
  el.setAttribute("aria-label", `Pin ${pin.number}`);
  el.innerHTML = `<span>${pin.number}</span>`;
  return el;
}

export function LocatorMap({
  fix,
  following,
  onUserPan,
  floors,
  pins,
  selectedPinId,
  onSelectPin,
  placing,
  onCrosshair,
  focus,
}: {
  fix: Fix | null;
  /** Keep the map centred on each new fix. */
  following: boolean;
  /** The user dragged the map, so it should stop following. */
  onUserPan: () => void;
  floors: VenueFloorsFile | null;
  pins: Pin[];
  selectedPinId: string | null;
  onSelectPin: (id: string) => void;
  /** Placing a pin: report the point under the centre crosshair as the map moves. */
  placing: boolean;
  onCrosshair: (point: CrosshairPoint) => void;
  focus: MapFocus | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const loadedRef = useRef(false);
  const onUserPanRef = useRef(onUserPan);
  const onSelectPinRef = useRef(onSelectPin);
  const onCrosshairRef = useRef(onCrosshair);

  useEffect(() => {
    onUserPanRef.current = onUserPan;
    onSelectPinRef.current = onSelectPin;
    onCrosshairRef.current = onCrosshair;
  }, [onUserPan, onSelectPin, onCrosshair]);

  useEffect(() => {
    if (!containerRef.current) return;
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_STYLE,
      center: [79.8612, 6.9271], // Colombo, until the first fix arrives
      zoom: 11,
      maxZoom: MAX_ZOOM,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "top-left");

    // The style is built on Mapbox Standard, which lights custom layers with
    // its (night) preset and dims them; every layer here sets
    // *-emissive-strength: 1 to keep its true colour.
    map.on("load", () => {
      map.addSource(ACCURACY_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "accuracy-fill",
        type: "fill",
        source: ACCURACY_SOURCE,
        paint: { "fill-color": "#2563eb", "fill-opacity": 0.12, "fill-emissive-strength": 1 },
      });
      map.addLayer({
        id: "accuracy-line",
        type: "line",
        source: ACCURACY_SOURCE,
        paint: { "line-color": "#2563eb", "line-opacity": 0.35, "line-width": 1, "line-emissive-strength": 1 },
      });
      loadedRef.current = true;
    });

    // Only real gestures carry an originalEvent — the map's own easeTo
    // calls must not switch following off.
    map.on("dragstart", (e) => {
      if ((e as { originalEvent?: Event }).originalEvent) onUserPanRef.current();
    });

    const dot = document.createElement("div");
    dot.className = "locator-dot";
    markerRef.current = new mapboxgl.Marker({ element: dot });
    mapRef.current = map;

    return () => {
      markerRef.current?.remove();
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
  }, []);

  // Move the dot and accuracy circle with every fix.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fix) return;
    const lngLat: [number, number] = [fix.longitude, fix.latitude];

    const marker = markerRef.current!;
    marker.setLngLat(lngLat);
    if (!marker.getElement().isConnected) marker.addTo(map);

    function drawAccuracy() {
      const source = map!.getSource(ACCURACY_SOURCE) as mapboxgl.GeoJSONSource | undefined;
      source?.setData(accuracyCircle(fix!.longitude, fix!.latitude, fix!.accuracy));
    }
    if (loadedRef.current) drawAccuracy();
    else map.once("load", drawAccuracy);
  }, [fix]);

  // Follow: jump in on the first fix, then glide to each new one.
  const hasCenteredRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fix || !following) return;
    const center: [number, number] = [fix.longitude, fix.latitude];
    if (!hasCenteredRef.current) {
      hasCenteredRef.current = true;
      map.jumpTo({ center, zoom: FIX_ZOOM });
    } else {
      map.easeTo({ center, zoom: Math.max(map.getZoom(), 15), duration: 600 });
    }
  }, [fix, following]);

  // Floor plans: outlines and a label per hall, drawn under the live dot.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !floors) return;
    const features = allFeatures(floors);
    const labels = floorLabels(floors);

    function draw() {
      const m = map!;
      const existing = m.getSource(FLOORS_SOURCE) as mapboxgl.GeoJSONSource | undefined;
      if (existing) {
        existing.setData(features);
        (m.getSource(FLOOR_LABELS_SOURCE) as mapboxgl.GeoJSONSource).setData(labels);
        return;
      }
      const before = m.getLayer("accuracy-fill") ? "accuracy-fill" : undefined;
      m.addSource(FLOORS_SOURCE, { type: "geojson", data: features });
      m.addSource(FLOOR_LABELS_SOURCE, { type: "geojson", data: labels });
      m.addLayer(
        {
          id: "floors-fill",
          type: "fill",
          source: FLOORS_SOURCE,
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "fill-color": "#fbbf24", "fill-opacity": 0.18, "fill-emissive-strength": 1 },
        },
        before
      );
      m.addLayer(
        {
          id: "floors-line",
          type: "line",
          source: FLOORS_SOURCE,
          paint: {
            "line-color": "#fbbf24",
            "line-opacity": 0.9,
            "line-width": ["interpolate", ["linear"], ["zoom"], 16, 1, 20, 2, 22, 3],
            "line-emissive-strength": 1,
          },
        },
        before
      );
      m.addLayer({
        id: "floors-label",
        type: "symbol",
        source: FLOOR_LABELS_SOURCE,
        minzoom: 16,
        // DIN Pro is a font this style's glyph set serves; the Mapbox default
        // (Open Sans) isn't in it, so labels would silently not render.
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
          "text-size": 13,
          "text-allow-overlap": false,
        },
        paint: {
          "text-color": "#fbbf24",
          "text-halo-color": "#000",
          "text-halo-width": 1.2,
          "text-emissive-strength": 1,
        },
      });
    }
    if (loadedRef.current) draw();
    else map.once("load", draw);
  }, [floors]);

  // Pin markers, kept in sync with the list.
  const pinMarkersRef = useRef(new Map<string, mapboxgl.Marker>());
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = pinMarkersRef.current;
    for (const [id, marker] of markers) {
      if (!pins.some((p) => p.id === id)) {
        marker.remove();
        markers.delete(id);
      }
    }
    for (const pin of pins) {
      let marker = markers.get(pin.id);
      if (!marker) {
        const el = pinElement(pin);
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelectPinRef.current(pin.id);
        });
        // Anchored at the tip, so the tip sits exactly on the coordinates.
        marker = new mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat([pin.longitude, pin.latitude]).addTo(map);
        markers.set(pin.id, marker);
      }
      marker.getElement().classList.toggle("is-selected", pin.id === selectedPinId);
    }
  }, [pins, selectedPinId]);

  // Crosshair: report the exact point under the centre of the map, snapped to
  // the nearest floor-plan corner when one is within SNAP_PX.
  const vertices = useMemo(() => (floors ? allVertices(floors) : []), [floors]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !placing) return;
    let frame = 0;

    function report() {
      frame = 0;
      const m = map!;
      const center = m.getCenter();
      const c = m.project(center);
      let best: [number, number] | null = null;
      let bestDist = SNAP_PX;
      for (const v of vertices) {
        const p = m.project(v);
        const d = Math.hypot(p.x - c.x, p.y - c.y);
        if (d <= bestDist) {
          bestDist = d;
          best = v;
        }
      }
      onCrosshairRef.current(
        best
          ? { longitude: best[0], latitude: best[1], snapped: true }
          : { longitude: center.lng, latitude: center.lat, snapped: false }
      );
    }
    function onMove() {
      if (!frame) frame = requestAnimationFrame(report);
    }

    // Placing from a city-wide view can't be precise — start at street level.
    if (map.getZoom() < 18) map.easeTo({ zoom: 19, duration: 400 });

    report();
    map.on("move", onMove);
    return () => {
      map.off("move", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [placing, vertices]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.easeTo({
      center: [focus.longitude, focus.latitude],
      zoom: focus.zoom ?? Math.max(map.getZoom(), 19),
      duration: 500,
    });
  }, [focus]);

  // Mapbox's own CSS sets `.mapboxgl-map { position: relative }`, which beats
  // Tailwind's layered `absolute` — so the positioning lives on a wrapper.
  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

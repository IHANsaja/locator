"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Feature, Polygon } from "geojson";
import type { Fix } from "@/lib/useLiveLocation";

// Same Mapbox style as the Blicq exhibition web app.
const MAPBOX_STYLE = "mapbox://styles/mevinu/cmqhxruko000201s2g9g864fk";
const FIX_ZOOM = 17;
const ACCURACY_SOURCE = "accuracy";

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

export function LocatorMap({
  fix,
  following,
  onUserPan,
}: {
  fix: Fix | null;
  /** Keep the map centred on each new fix. */
  following: boolean;
  /** The user dragged the map, so it should stop following. */
  onUserPan: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const loadedRef = useRef(false);
  const onUserPanRef = useRef(onUserPan);

  useEffect(() => {
    onUserPanRef.current = onUserPan;
  }, [onUserPan]);

  useEffect(() => {
    if (!containerRef.current) return;
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAPBOX_STYLE,
      center: [79.8612, 6.9271], // Colombo, until the first fix arrives
      zoom: 11,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "top-left");

    map.on("load", () => {
      map.addSource(ACCURACY_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "accuracy-fill",
        type: "fill",
        source: ACCURACY_SOURCE,
        paint: { "fill-color": "#2563eb", "fill-opacity": 0.12 },
      });
      map.addLayer({
        id: "accuracy-line",
        type: "line",
        source: ACCURACY_SOURCE,
        paint: { "line-color": "#2563eb", "line-opacity": 0.35, "line-width": 1 },
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

  // Mapbox's own CSS sets `.mapboxgl-map { position: relative }`, which beats
  // Tailwind's layered `absolute` — so the positioning lives on a wrapper.
  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

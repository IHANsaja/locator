"use client";

import { useEffect, useState } from "react";
import type { Feature, FeatureCollection, Point } from "geojson";

export type Pin = {
  id: string;
  /** Shown to the user: "Pin 1", "Pin 2", … — numbering never reuses a deleted pin's number. */
  number: number;
  latitude: number;
  longitude: number;
  /** Placed on a floor-plan corner, so the coordinates are the corner's own, unrounded. */
  snapped: boolean;
  /** The floor (hall) the pin is inside, if any. */
  floor: string | null;
  createdAt: number;
};

const STORAGE_KEY = "locator:pins";

function readStored(): Pin[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Pin[]) : [];
  } catch {
    return [];
  }
}

/** Pins, kept in this browser's storage so they survive a reload. The
 * component using this must be client-only (it reads localStorage while
 * rendering). */
export function usePins() {
  const [pins, setPins] = useState<Pin[]>(readStored);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
    } catch {
      // Storage full or blocked — pins still work for this visit.
    }
  }, [pins]);

  function addPin(pin: Omit<Pin, "id" | "number" | "createdAt">): Pin {
    const created: Pin = {
      ...pin,
      id: crypto.randomUUID(),
      number: pins.reduce((max, p) => Math.max(max, p.number), 0) + 1,
      createdAt: Date.now(),
    };
    setPins((prev) => [...prev, created]);
    return created;
  }

  function removePin(id: string) {
    setPins((prev) => prev.filter((p) => p.id !== id));
  }

  function clearPins() {
    setPins([]);
  }

  return { pins, addPin, removePin, clearPins };
}

function pinFeature(pin: Pin): Feature<Point> {
  return {
    type: "Feature",
    properties: { name: `Pin ${pin.number}`, floor: pin.floor, snapped: pin.snapped },
    geometry: { type: "Point", coordinates: [pin.longitude, pin.latitude] },
  };
}

/** A pin as a GeoJSON Feature, ready to paste into a FeatureCollection. */
export function pinToGeoJSON(pin: Pin) {
  return JSON.stringify(pinFeature(pin));
}

/** All pins as one GeoJSON FeatureCollection, in the order they were dropped. */
export function pinsToGeoJSON(pins: Pin[]) {
  const fc: FeatureCollection<Point> = { type: "FeatureCollection", features: pins.map(pinFeature) };
  return JSON.stringify(fc, null, 2);
}

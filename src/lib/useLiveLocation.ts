"use client";

import { useEffect, useState } from "react";

export type Fix = {
  latitude: number;
  longitude: number;
  /** Radius of uncertainty, in metres. */
  accuracy: number;
  timestamp: number;
};

export type LocationStatus = "starting" | "live" | "denied" | "unavailable" | "unsupported" | "insecure";

/** Why tracking can't start at all, or "starting". Reads `window`, so the
 * component using this hook must be client-only (rendered with ssr: false). */
function initialStatus(): LocationStatus {
  // Geolocation only works on https or localhost.
  if (!window.isSecureContext) return "insecure";
  if (!("geolocation" in navigator)) return "unsupported";
  return "starting";
}

/** How often to ask for a fresh fix on top of the watch. */
const POLL_MS = 1000;

/** A precise fix younger than this isn't replaced by a much rougher one. */
const KEEP_PRECISE_MS = 5000;

/** Whether a new fix should replace the current one. Phones mix GPS fixes
 * (a few metres) with rough Wi-Fi/cell estimates (tens to hundreds of
 * metres); letting a rough one through makes the point jump away and back.
 * A rough fix still wins once the precise one is stale, so a real move
 * (e.g. walking indoors, losing GPS) is never hidden for long. */
function isBetter(next: GeolocationPosition, current: { accuracy: number; timestamp: number } | null) {
  if (!current) return true;
  if (next.timestamp < current.timestamp) return false; // answers can arrive out of order
  if (next.timestamp - current.timestamp > KEEP_PRECISE_MS) return true;
  return next.coords.accuracy <= current.accuracy * 1.5 + 5;
}

/** Follows the device's position, refreshed every second, for as long as the
 * page is open.
 *
 * `watchPosition` alone only reports when the device decides the position
 * has changed (iOS Safari goes quiet while you stand still), so a fresh
 * `getCurrentPosition` is also requested every second. Both feed the same
 * state, and an older or much rougher fix never overwrites a newer precise
 * one (see isBetter).
 *
 * Browsers pause location while the tab is hidden, and a timeout or a lost
 * signal ends a watch on some devices. So the watch is restarted whenever
 * the tab comes back into view, and after any error other than a refused
 * permission. */
export function useLiveLocation() {
  const [fix, setFix] = useState<Fix | null>(null);
  const [status, setStatus] = useState<LocationStatus>(initialStatus);

  useEffect(() => {
    if (initialStatus() !== "starting") return;

    let watchId: number | null = null;
    let retryTimer: number | undefined;
    let current: { accuracy: number; timestamp: number } | null = null;
    let pollInFlight = false;
    let denied = false;

    function onPosition(pos: GeolocationPosition) {
      denied = false;
      if (!isBetter(pos, current)) return;
      current = { accuracy: pos.coords.accuracy, timestamp: pos.timestamp };
      setFix({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp,
      });
      setStatus("live");
    }

    function start() {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = navigator.geolocation.watchPosition(
        onPosition,
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            denied = true;
            setStatus("denied");
            return;
          }
          setStatus("unavailable");
          window.clearTimeout(retryTimer);
          retryTimer = window.setTimeout(start, 3000);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
      );
    }

    // Poll errors are left to the watch's handler, which already reports
    // them — a single slow poll shouldn't flip the status.
    const pollTimer = window.setInterval(() => {
      if (pollInFlight || denied || document.visibilityState !== "visible") return;
      pollInFlight = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          pollInFlight = false;
          onPosition(pos);
        },
        () => {
          pollInFlight = false;
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
      );
    }, POLL_MS);

    function onVisibilityChange() {
      if (document.visibilityState === "visible") start();
    }

    start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    // A permission granted later from the browser's site settings should
    // resume tracking without a reload.
    let permission: PermissionStatus | undefined;
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((p) => {
        permission = p;
        p.onchange = () => {
          if (p.state === "granted") start();
          if (p.state === "denied") setStatus("denied");
        };
      })
      .catch(() => {});

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      window.clearTimeout(retryTimer);
      window.clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (permission) permission.onchange = null;
    };
  }, []);

  return { fix, status };
}

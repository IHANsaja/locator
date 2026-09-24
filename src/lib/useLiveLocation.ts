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

/** Follows the device's position for as long as the page is open.
 *
 * `watchPosition` keeps delivering fixes on its own, but browsers pause it
 * while the tab is hidden, and a timeout or a lost signal ends a watch on
 * some devices. So the watch is restarted whenever the tab comes back into
 * view, and after any error other than a refused permission. */
export function useLiveLocation() {
  const [fix, setFix] = useState<Fix | null>(null);
  const [status, setStatus] = useState<LocationStatus>(initialStatus);

  useEffect(() => {
    if (initialStatus() !== "starting") return;

    let watchId: number | null = null;
    let retryTimer: number | undefined;

    function start() {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setFix({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
          });
          setStatus("live");
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
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
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (permission) permission.onchange = null;
    };
  }, []);

  return { fix, status };
}

"use client";

import { useEffect, useState } from "react";
import { LocatorMap } from "@/components/LocatorMap";
import { CopyRow } from "@/components/CopyRow";
import { useLiveLocation, type LocationStatus } from "@/lib/useLiveLocation";

const HAS_MAPBOX_TOKEN = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN);

/** ~0.1 m at the equator — as precise as a phone's GPS can honestly claim. */
const DECIMALS = 6;

const STATUS_MESSAGES: Partial<Record<LocationStatus, { title: string; body: string }>> = {
  denied: {
    title: "Location access is off",
    body: "Allow location for this site in your browser settings — tracking resumes on its own once it's on.",
  },
  insecure: {
    title: "Needs a secure connection",
    body: "Browsers only share location over https (or localhost). Open this page over https.",
  },
  unsupported: {
    title: "Location isn't available",
    body: "This browser doesn't support location. Try a recent version of Chrome or Safari.",
  },
};

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

function StatusPill({ status, updatedAgo }: { status: LocationStatus; updatedAgo: number | null }) {
  const live = status === "live";
  const label = live
    ? updatedAgo !== null && updatedAgo >= 5
      ? `Updated ${updatedAgo}s ago`
      : "Live"
    : status === "unavailable"
      ? "Searching for signal…"
      : status === "starting"
        ? "Finding you…"
        : "Location off";

  return (
    <span className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 dark:text-zinc-300">
      <span className="relative flex h-2.5 w-2.5">
        {live && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-60" />}
        <span
          className={
            "relative h-2.5 w-2.5 rounded-full " +
            (live ? "bg-emerald-500" : status === "denied" ? "bg-red-500" : "bg-amber-500")
          }
        />
      </span>
      {label}
    </span>
  );
}

export default function Locator() {
  const { fix, status } = useLiveLocation();
  const [following, setFollowing] = useState(true);
  const now = useNow(1000);

  const message = STATUS_MESSAGES[status];
  const updatedAgo = fix ? Math.max(0, Math.round((now - fix.timestamp) / 1000)) : null;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-zinc-200 dark:bg-zinc-900">
      {HAS_MAPBOX_TOKEN ? (
        <LocatorMap fix={fix} following={following} onUserPan={() => setFollowing(false)} />
      ) : (
        // A deploy without the token would otherwise show a blank map. The
        // coordinates below still work without it.
        <p className="absolute inset-x-0 top-1/3 px-8 text-center text-sm text-zinc-500">
          Map unavailable — set NEXT_PUBLIC_MAPBOX_TOKEN and redeploy.
        </p>
      )}

      {fix && !following && (
        <button
          type="button"
          onClick={() => setFollowing(true)}
          aria-label="Center on my location"
          className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white text-blue-600 shadow-lg ring-1 ring-black/5 transition active:scale-95 dark:bg-zinc-900"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden>
            <circle cx="12" cy="12" r="3" fill="currentColor" />
            <circle cx="12" cy="12" r="8" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2" strokeLinecap="round" />
          </svg>
        </button>
      )}

      <section className="absolute inset-x-0 bottom-0 z-10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-md space-y-3 rounded-3xl bg-white p-4 shadow-2xl ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-white/10">
          <div className="flex items-center justify-between px-1">
            <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-50">Locator</h1>
            <StatusPill status={status} updatedAgo={updatedAgo} />
          </div>

          {message ? (
            <div className="rounded-2xl bg-red-50 p-4 dark:bg-red-950/40">
              <p className="font-semibold text-red-700 dark:text-red-300">{message.title}</p>
              <p className="mt-1 text-sm text-red-700/80 dark:text-red-300/80">{message.body}</p>
            </div>
          ) : (
            <>
              <CopyRow label="Latitude" value={fix ? fix.latitude.toFixed(DECIMALS) : null} />
              <CopyRow label="Longitude" value={fix ? fix.longitude.toFixed(DECIMALS) : null} />
              <p className="px-1 text-xs text-zinc-500">
                {fix ? `Accurate to ±${Math.round(fix.accuracy)} m` : "Waiting for the first GPS fix…"}
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { LocatorMap } from "@/components/LocatorMap";
import { CopyRow } from "@/components/CopyRow";
import { useLiveLocation, type Fix, type LocationStatus } from "@/lib/useLiveLocation";

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

function StatusPill({
  status,
  paused,
  updatedAgo,
}: {
  status: LocationStatus;
  paused: boolean;
  updatedAgo: number | null;
}) {
  const live = status === "live" && !paused;
  const label = paused
    ? "Paused"
    : live
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
            (live ? "bg-emerald-500" : status === "denied" && !paused ? "bg-red-500" : "bg-amber-500")
          }
        />
      </span>
      {label}
    </span>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

function CaptureIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4" aria-hidden>
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" strokeLinejoin="round" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

/** How far to trust a fix, from its accuracy radius in metres. */
function accuracyQuality(metres: number) {
  if (metres <= 10) return { label: "Precise", className: "text-emerald-600 dark:text-emerald-400", tip: null };
  if (metres <= 30) return { label: "Good", className: "text-amber-600 dark:text-amber-400", tip: null };
  return {
    label: "Rough",
    className: "text-red-600 dark:text-red-400",
    tip: "Move outdoors, away from buildings, for a precise point.",
  };
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function AccuracyLine({ fix }: { fix: Fix | null }) {
  if (!fix) return <p className="px-1 text-xs text-zinc-500">Waiting for the first GPS fix…</p>;
  const quality = accuracyQuality(fix.accuracy);
  return (
    <p className="px-1 text-xs text-zinc-500">
      <span className={"font-semibold " + quality.className}>{quality.label}</span> · accurate to ±
      {Math.round(fix.accuracy)} m{quality.tip && <span className="block pt-0.5">{quality.tip}</span>}
    </p>
  );
}

/** The location saved with the Capture button, pinned to the top right so it
 * stays readable (and copyable) while the live values keep changing. */
function CapturedCard({ capture, onClose }: { capture: Fix; onClose: () => void }) {
  return (
    <div className="w-60 space-y-2 rounded-2xl bg-white p-3 shadow-xl ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-white/10">
      <div className="flex items-start justify-between gap-2 px-1">
        <div>
          <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Captured</p>
          <p className="text-xs text-zinc-500">
            {timeFormat.format(capture.timestamp)} · ±{Math.round(capture.accuracy)} m
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss captured location"
          className="-mr-1 -mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <CopyRow compact label="Latitude" value={capture.latitude.toFixed(DECIMALS)} copyLabel="Copy captured latitude" />
      <CopyRow compact label="Longitude" value={capture.longitude.toFixed(DECIMALS)} copyLabel="Copy captured longitude" />
    </div>
  );
}

export default function Locator() {
  const { fix: liveFix, status } = useLiveLocation();
  const [following, setFollowing] = useState(true);
  // While paused, everything on screen (numbers, dot, map) holds this fix.
  // The watch keeps running underneath, so resuming is instant.
  const [pausedAt, setPausedAt] = useState<Fix | null>(null);
  const [capture, setCapture] = useState<Fix | null>(null);
  const now = useNow(1000);

  const paused = pausedAt !== null;
  const fix = pausedAt ?? liveFix;
  const message = STATUS_MESSAGES[status];
  const updatedAgo = fix ? Math.max(0, Math.round((now - fix.timestamp) / 1000)) : null;

  function togglePause() {
    setPausedAt(paused ? null : liveFix);
  }

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

      <div className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex flex-col items-end gap-3">
        {capture && <CapturedCard capture={capture} onClose={() => setCapture(null)} />}
        {fix && !following && (
          <button
            type="button"
            onClick={() => setFollowing(true)}
            aria-label="Center on my location"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-blue-600 shadow-lg ring-1 ring-black/5 transition active:scale-95 dark:bg-zinc-900"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5" aria-hidden>
              <circle cx="12" cy="12" r="3" fill="currentColor" />
              <circle cx="12" cy="12" r="8" />
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      <section className="absolute inset-x-0 bottom-0 z-10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-md space-y-3 rounded-3xl bg-white p-4 shadow-2xl ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-white/10">
          <div className="flex items-center justify-between px-1">
            <h1 className="text-base font-bold text-zinc-900 dark:text-zinc-50">Locator</h1>
            <StatusPill status={status} paused={paused} updatedAgo={updatedAgo} />
          </div>

          {message && !paused ? (
            <div className="rounded-2xl bg-red-50 p-4 dark:bg-red-950/40">
              <p className="font-semibold text-red-700 dark:text-red-300">{message.title}</p>
              <p className="mt-1 text-sm text-red-700/80 dark:text-red-300/80">{message.body}</p>
            </div>
          ) : (
            <>
              <CopyRow label="Latitude" value={fix ? fix.latitude.toFixed(DECIMALS) : null} />
              <CopyRow label="Longitude" value={fix ? fix.longitude.toFixed(DECIMALS) : null} />
              <AccuracyLine fix={fix} />
            </>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={togglePause}
              disabled={!paused && !liveFix}
              aria-pressed={paused}
              className={
                "flex h-12 items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition active:scale-95 disabled:opacity-40 " +
                (paused ? "bg-amber-500 text-white" : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50")
              }
            >
              {paused ? <PlayIcon /> : <PauseIcon />}
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              onClick={() => fix && setCapture(fix)}
              disabled={!fix}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-blue-600 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-40"
            >
              <CaptureIcon />
              Capture
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

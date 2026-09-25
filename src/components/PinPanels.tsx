"use client";

import { CopyButton, CopyRow, formatBoth } from "@/components/CopyRow";
import type { CrosshairPoint } from "@/components/LocatorMap";
import { pinToGeoJSON, pinsToGeoJSON, type Pin } from "@/lib/pins";

/** ~1 cm — pins are placed on the map, not read from GPS, so they can
 * honestly carry more digits than the live position. */
export const PIN_DECIMALS = 7;

function SnapBadge({ snapped }: { snapped: boolean }) {
  return snapped ? (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
      Snapped to corner
    </span>
  ) : null;
}

/** The fixed crosshair in the middle of the map while placing a pin. Green
 * when it has snapped to a floor-plan corner. */
export function Crosshair({ snapped }: { snapped: boolean }) {
  const color = snapped ? "text-emerald-400" : "text-rose-500";
  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
      <svg viewBox="0 0 48 48" className={"h-12 w-12 drop-shadow-[0_0_2px_rgb(0_0_0/0.9)] " + color}>
        <circle cx="24" cy="24" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M24 2v14M24 32v14M2 24h14M32 24h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="24" cy="24" r="1.5" fill="currentColor" />
      </svg>
    </div>
  );
}

export function PlacingPanel({
  point,
  floor,
  onDrop,
  onCancel,
}: {
  point: CrosshairPoint | null;
  floor: string | null;
  onDrop: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">Drop a pin</h2>
        {point && <SnapBadge snapped={point.snapped} />}
      </div>
      <p className="px-1 text-xs text-zinc-500">
        Move the map to put the crosshair on the spot, and zoom in for precision. It snaps to floor-plan corners.
      </p>
      <div className="rounded-2xl bg-zinc-100 px-4 py-2.5 dark:bg-zinc-800">
        <p className="font-mono text-base font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
          {point ? point.latitude.toFixed(PIN_DECIMALS) : "—"}
        </p>
        <p className="font-mono text-base font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
          {point ? point.longitude.toFixed(PIN_DECIMALS) : "—"}
        </p>
        <p className="pt-0.5 text-xs text-zinc-500">{floor ?? "Outside the floor plans"}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-12 rounded-2xl bg-zinc-100 text-sm font-semibold text-zinc-900 transition active:scale-95 dark:bg-zinc-800 dark:text-zinc-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onDrop}
          disabled={!point}
          className="h-12 rounded-2xl bg-rose-600 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-40"
        >
          Drop pin
        </button>
      </div>
    </>
  );
}

export function PinDetails({
  pin,
  pins,
  onClose,
  onDelete,
}: {
  pin: Pin;
  pins: Pin[];
  onClose: () => void;
  onDelete: () => void;
}) {
  const lat = pin.latitude.toFixed(PIN_DECIMALS);
  const lng = pin.longitude.toFixed(PIN_DECIMALS);
  return (
    <>
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">Pin {pin.number}</h2>
          <SnapBadge snapped={pin.snapped} />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close pin details"
          className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <p className="-mt-1 px-1 text-xs text-zinc-500">{pin.floor ?? "Outside the floor plans"}</p>
      <CopyRow label="Latitude" value={lat} copyLabel="Copy pin latitude" />
      <CopyRow label="Longitude" value={lng} copyLabel="Copy pin longitude" />
      <div className="grid grid-cols-2 gap-2">
        <CopyButton compact variant="soft" label="Copy both" ariaLabel="Copy pin latitude and longitude" value={formatBoth(lat, lng)} />
        <CopyButton compact variant="soft" label="Copy GeoJSON" ariaLabel="Copy pin as GeoJSON" value={pinToGeoJSON(pin)} />
        <CopyButton
          compact
          variant="soft"
          label={`Copy all ${pins.length} pins`}
          ariaLabel="Copy all pins as a GeoJSON FeatureCollection"
          value={pinsToGeoJSON(pins)}
        />
        <button
          type="button"
          onClick={onDelete}
          className="h-8 rounded-lg bg-red-50 text-xs font-semibold text-red-700 transition active:scale-95 dark:bg-red-950/50 dark:text-red-300"
        >
          Delete pin
        </button>
      </div>
    </>
  );
}

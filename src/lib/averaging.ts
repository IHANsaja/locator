/** Averaging GPS readings while the device stands still.
 *
 * Each reading scatters randomly by a few metres around the true position.
 * Averaging many readings taken at the same spot cancels much of that
 * scatter, so the averaged point is steadier and closer to the truth than
 * any single reading. Readings are weighted by 1/accuracy², so a ±4 m
 * reading counts ~6× more than a ±10 m one.
 *
 * A single reading far from the average is skipped as a stray. Two in a row
 * mean the device really moved: the window restarts from those two, so the
 * point follows within about two seconds. */

export type Reading = {
  latitude: number;
  longitude: number;
  /** Radius of uncertainty, in metres. */
  accuracy: number;
  timestamp: number;
};

/** Readings older than this drop out of the average. */
const WINDOW_MS = 30_000;
/** Upper bound on readings kept (about 30 s at one reading per second). */
const MAX_READINGS = 40;
/** How far outside the combined uncertainty a reading must land to count as
 * away from the average. Phones report accuracy as roughly a one-sigma
 * radius, so normal jitter exceeds 1.5x it about one time in six — too often
 * to read as movement. */
const MOVE_FACTOR = 2.5;
/** Never treat jitter smaller than this as movement, even with tiny accuracies. */
const MIN_MOVE_METRES = 3;

/** Distance in metres between two points — equirectangular, which is exact
 * enough at the tens-of-metres scale this deals with. */
export function distanceMetres(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6_371_000;
  const toRad = Math.PI / 180;
  const x = (b.longitude - a.longitude) * toRad * Math.cos(((a.latitude + b.latitude) / 2) * toRad);
  const y = (b.latitude - a.latitude) * toRad;
  return Math.sqrt(x * x + y * y) * R;
}

export type Averaged = Reading & {
  /** How many readings the point averages (1 = a single live reading). */
  samples: number;
};

function weightedMean(readings: Reading[]): Averaged {
  let wSum = 0;
  let lat = 0;
  let lng = 0;
  for (const r of readings) {
    const w = 1 / (r.accuracy * r.accuracy);
    wSum += w;
    lat += r.latitude * w;
    lng += r.longitude * w;
  }
  const latest = readings[readings.length - 1];
  return {
    latitude: lat / wSum,
    longitude: lng / wSum,
    // The best single reading's accuracy. Averaging does tighten the point,
    // but GPS errors are partly correlated over time, so claiming the
    // statistically shrunk figure would overstate it.
    accuracy: Math.min(...readings.map((r) => r.accuracy)),
    timestamp: latest.timestamp,
    samples: readings.length,
  };
}

/** Keeps the readings taken at the current spot and returns their average. */
export class StationaryAverager {
  private readings: Reading[] = [];
  /** A reading that landed away from the average, waiting for a second. */
  private stray: Reading | null = null;

  add(reading: Reading): Averaged {
    const cutoff = reading.timestamp - WINDOW_MS;
    this.readings = this.readings.filter((r) => r.timestamp >= cutoff);

    if (this.readings.length > 0) {
      const mean = weightedMean(this.readings);
      const allowed = Math.max(MIN_MOVE_METRES, MOVE_FACTOR * Math.max(reading.accuracy, mean.accuracy));
      if (distanceMetres(mean, reading) > allowed) {
        if (!this.stray) {
          // Possibly a stray — hold it back and keep showing the average.
          this.stray = reading;
          return mean;
        }
        // Second one in a row: moved. Start over from both.
        this.readings = [this.stray];
      }
    }
    this.stray = null;

    this.readings.push(reading);
    if (this.readings.length > MAX_READINGS) this.readings.shift();
    return weightedMean(this.readings);
  }

  reset() {
    this.readings = [];
    this.stray = null;
  }
}

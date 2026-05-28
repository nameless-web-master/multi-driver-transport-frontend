import { cellToLatLng, isValidCell } from "h3-js";
import type { DriverZone, LatLngPoint } from "@/types";

const EARTH_RADIUS_KM = 6371;

/**
 * Average area (km²) of a single H3 cell at each resolution.
 * Source: H3 documentation tables (avg hex area).
 * Used to estimate how many cells will fill a given polygon area, so we
 * can pick a coarser resolution for huge geofences (avoiding tens of
 * thousands of cells) without sacrificing detail for tiny ones.
 */
export const H3_AVG_AREA_KM2: Record<number, number> = {
  0: 4_357_449.4,
  1: 609_788.4,
  2: 86_801.8,
  3: 12_393.4,
  4: 1_770.32,
  5: 252.903,
  6: 36.1290,
  7: 5.16129,
  8: 0.73733,
  9: 0.10533,
  10: 0.015047,
  11: 0.002150,
  12: 0.000307,
  13: 0.0000439,
  14: 0.00000627,
  15: 0.00000089,
};

/**
 * Spherical polygon area (km²). Uses the standard signed sum on the
 * sphere; the absolute value guards against vertex ordering.
 *
 * Accurate enough for picking an H3 resolution; small polygons (a few
 * km) are within a fraction of a percent of the planar shoelace answer.
 */
export function polygonAreaKm2(boundary: LatLngPoint[]): number {
  if (!boundary || boundary.length < 3) return 0;
  const R = EARTH_RADIUS_KM;
  let sum = 0;
  const n = boundary.length;
  for (let i = 0; i < n; i++) {
    const p1 = boundary[i];
    const p2 = boundary[(i + 1) % n];
    const lng1 = (p1.lng * Math.PI) / 180;
    const lng2 = (p2.lng * Math.PI) / 180;
    const lat1 = (p1.lat * Math.PI) / 180;
    const lat2 = (p2.lat * Math.PI) / 180;
    sum += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return Math.abs((sum * R * R) / 2);
}

/**
 * Pick the finest H3 resolution where filling `areaKm2` is estimated to
 * produce at most `targetCells` cells. Larger areas snap to coarser
 * resolutions automatically so a continent-sized geofence doesn't blow
 * up into a million hex polygons.
 *
 * Walks from `max` down to `min` and returns the first resolution whose
 * estimated cell count fits the budget; if none fit (huge area), returns
 * `min`.
 */
export function chooseResolutionForArea(
  areaKm2: number,
  targetCells = 400,
  min = 1,
  max = 10
): number {
  if (!Number.isFinite(areaKm2) || areaKm2 <= 0) {
    return Math.min(7, max);
  }
  for (let r = max; r >= min; r--) {
    const avg = H3_AVG_AREA_KM2[r];
    if (avg == null) continue;
    if (areaKm2 / avg <= targetCells) {
      return r;
    }
  }
  return min;
}

/** Rough cell-count estimate for `areaKm2` at H3 `resolution`. */
export function estimateCellCount(areaKm2: number, resolution: number): number {
  const avg = H3_AVG_AREA_KM2[resolution];
  if (!avg || avg <= 0) return 0;
  return Math.max(1, Math.round(areaKm2 / avg));
}

/** Human-readable area: m² under 0.01 km², otherwise km² with sensible precision. */
export function formatAreaKm2(km2: number): string {
  if (!Number.isFinite(km2) || km2 <= 0) return "—";
  if (km2 < 0.01) return `${Math.round(km2 * 1_000_000)} m²`;
  if (km2 < 1) return `${(km2 * 100).toFixed(1)} ha`;
  if (km2 < 100) return `${km2.toFixed(2)} km²`;
  if (km2 < 10_000) return `${km2.toFixed(0)} km²`;
  return `${(km2 / 1000).toFixed(1)}k km²`;
}

/** Great-circle distance between two lat/lng points in kilometers. */
export function haversineKm(a: LatLngPoint, b: LatLngPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Approximate center of a driver zone:
 * - prefers the average of its geofence boundary points
 * - otherwise the average of its H3 cell centers
 *
 * A handful of cells is sampled (instead of all of them) to keep the cost
 * bounded for very large zones.
 */
export function zoneCentroid(zone: DriverZone): LatLngPoint | null {
  if (zone.boundary && zone.boundary.length > 0) {
    return averagePoints(zone.boundary);
  }
  if (Array.isArray(zone.h3_cells) && zone.h3_cells.length > 0) {
    const sample = zone.h3_cells.length > 64 ? sampleEvenly(zone.h3_cells, 64) : zone.h3_cells;
    const points: LatLngPoint[] = [];
    for (const cell of sample) {
      if (!isValidCell(cell)) continue;
      const [lat, lng] = cellToLatLng(cell);
      points.push({ lat, lng });
    }
    if (points.length > 0) return averagePoints(points);
  }
  return null;
}

/** Group zones by their owner so we can compute per-driver distance fast. */
export function groupZonesByOwner(zones: DriverZone[]): Map<number, DriverZone[]> {
  const map = new Map<number, DriverZone[]>();
  for (const z of zones) {
    const list = map.get(z.owner_user_id);
    if (list) list.push(z);
    else map.set(z.owner_user_id, [z]);
  }
  return map;
}

/**
 * Minimum distance (km) from `from` to any of the driver's zones, using each
 * zone's centroid as its representative point. Returns `null` if the driver
 * has no zones with usable geometry.
 */
export function nearestZoneDistanceKm(
  from: LatLngPoint,
  zones: DriverZone[] | undefined
): number | null {
  if (!zones || zones.length === 0) return null;
  let best: number | null = null;
  for (const z of zones) {
    const c = zoneCentroid(z);
    if (!c) continue;
    const d = haversineKm(from, c);
    if (best === null || d < best) best = d;
  }
  return best;
}

/** Human-readable distance: meters under 1 km, otherwise km with one decimal. */
export function formatDistanceKm(km: number): string {
  if (!Number.isFinite(km)) return "—";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

function averagePoints(points: LatLngPoint[]): LatLngPoint {
  let lat = 0;
  let lng = 0;
  for (const p of points) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / points.length, lng: lng / points.length };
}

function sampleEvenly<T>(arr: T[], count: number): T[] {
  if (arr.length <= count) return arr;
  const step = arr.length / count;
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    out.push(arr[Math.floor(i * step)]);
  }
  return out;
}

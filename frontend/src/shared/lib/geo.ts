/** Bounding box tuple ordered as: [minLon, minLat, maxLon, maxLat] */
export type BBox = [number, number, number, number];

/** Standard bounding box covering the North Eastern Region of India. */
export const NER_BBOX: BBox = [89.5, 21.5, 97.5, 29.5];

/**
 * Validates whether latitude and longitude are finite numbers within Earth geographic boundaries.
 */
export function isValidLatLon(lat: unknown, lon: unknown): boolean {
  if (typeof lat !== "number" || typeof lon !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

/**
 * Computes the great-circle distance between two points in meters using the Haversine formula.
 */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth mean radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates a bounding box [minLon, minLat, maxLon, maxLat] around a center coordinate given radius in meters.
 */
export function bboxAround(lat: number, lon: number, radiusMeters: number): BBox {
  const deltaLat = radiusMeters / 111139;
  const latCos = Math.cos((lat * Math.PI) / 180);
  const deltaLon = radiusMeters / (111139 * (Math.abs(latCos) > 1e-6 ? Math.abs(latCos) : 1));
  return [lon - deltaLon, lat - deltaLat, lon + deltaLon, lat + deltaLat];
}

/**
 * Computes the tightest bounding box encompassing a list of [lon, lat] coordinates.
 */
export function bboxOfCoordinates(coords: ReadonlyArray<[number, number]>): BBox | null {
  if (!coords || coords.length === 0) return null;
  let minLon = coords[0]![0];
  let minLat = coords[0]![1];
  let maxLon = coords[0]![0];
  let maxLat = coords[0]![1];

  for (let i = 1; i < coords.length; i++) {
    const [lon, lat] = coords[i]!;
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }

  return [minLon, minLat, maxLon, maxLat];
}

/**
 * Rounds bounding box coordinates to a fixed precision to prevent unnecessary query cache invalidation.
 */
export function snapBBox(bbox: BBox, precision = 2): BBox {
  const factor = Math.pow(10, precision);
  return [
    Math.round(bbox[0] * factor) / factor,
    Math.round(bbox[1] * factor) / factor,
    Math.round(bbox[2] * factor) / factor,
    Math.round(bbox[3] * factor) / factor,
  ];
}

/**
 * Formats a distance in meters into a human-readable string.
 */
export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined || isNaN(meters)) return "unknown distance";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

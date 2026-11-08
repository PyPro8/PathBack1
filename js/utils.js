/**
 * PathBack utility functions
 * Pure functions — easy to unit test.
 */

/**
 * Haversine distance between two lat/lng points in metres.
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} distance in metres
 */
export function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in metres
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Total path distance from an array of {lat, lng} points in metres.
 * @param {Array<{lat: number, lng: number}>} points
 * @returns {number}
 */
export function pathDistance(points) {
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversine(
      points[i - 1].lat,
      points[i - 1].lng,
      points[i].lat,
      points[i].lng
    );
  }
  return total;
}

/**
 * Format metres as km with 2 decimal places.
 * @param {number} metres
 * @returns {string}
 */
export function formatDistance(metres) {
  return (metres / 1000).toFixed(2);
}

/**
 * Format milliseconds as MM:SS or HH:MM:SS.
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
  if (ms < 0 || !Number.isFinite(ms)) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

/**
 * Format a timestamp for display.
 * @param {number} ts
 * @returns {string}
 */
export function formatTimestamp(ts) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return '—';
  }
}

/**
 * Validate a GPS coordinate pair.
 * @param {number} lat
 * @param {number} lng
 * @returns {boolean}
 */
export function isValidCoordinate(lat, lng) {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Should we accept a new GPS point?
 * Filters duplicates and extreme jumps while allowing legitimate movement.
 *
 * Rules:
 * - Must be valid coordinates
 * - Must be at least MIN_DISTANCE_M from last point (avoids stationary noise)
 * - Must not jump more than MAX_JUMP_M from last point (filters GPS glitches)
 * - Accuracy must be reasonable when available
 *
 * @param {{lat: number, lng: number, accuracy?: number, timestamp?: number}} newPoint
 * @param {{lat: number, lng: number, accuracy?: number, timestamp?: number}|null} lastPoint
 * @param {object} [opts]
 * @returns {{accept: boolean, reason?: string}}
 */
export function shouldAcceptPoint(newPoint, lastPoint, opts = {}) {
  const MIN_DISTANCE_M = opts.minDistance ?? 3; // metres
  const MAX_JUMP_M = opts.maxJump ?? 200; // metres — large but filters satellite jumps
  const MAX_ACCURACY_M = opts.maxAccuracy ?? 100;

  if (!isValidCoordinate(newPoint.lat, newPoint.lng)) {
    return { accept: false, reason: 'invalid_coords' };
  }

  if (
    newPoint.accuracy != null &&
    Number.isFinite(newPoint.accuracy) &&
    newPoint.accuracy > MAX_ACCURACY_M
  ) {
    return { accept: false, reason: 'poor_accuracy' };
  }

  if (!lastPoint) {
    return { accept: true };
  }

  const dist = haversine(lastPoint.lat, lastPoint.lng, newPoint.lat, newPoint.lng);

  if (dist < MIN_DISTANCE_M) {
    return { accept: false, reason: 'too_close' };
  }

  if (dist > MAX_JUMP_M) {
    return { accept: false, reason: 'jump_too_large' };
  }

  return { accept: true };
}

/**
 * Reverse a route (for Retrace My Steps).
 * Returns a new array; does not mutate input.
 * @param {Array} points
 * @returns {Array}
 */
export function reverseRoute(points) {
  if (!Array.isArray(points)) return [];
  return [...points].reverse();
}

/**
 * Minimum distance from a point to any segment of a polyline (metres).
 * Used for deviation detection.
 * @param {{lat: number, lng: number}} point
 * @param {Array<{lat: number, lng: number}>} route
 * @returns {number}
 */
export function distanceToRoute(point, route) {
  if (!route || route.length === 0) return Infinity;
  if (route.length === 1) {
    return haversine(point.lat, point.lng, route[0].lat, route[0].lng);
  }

  let minDist = Infinity;
  for (let i = 0; i < route.length - 1; i++) {
    const d = distanceToSegment(point, route[i], route[i + 1]);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

/**
 * Approximate distance from point to a line segment defined by two lat/lng points.
 * Uses local equirectangular projection for speed (good enough for short segments).
 * @param {{lat: number, lng: number}} p
 * @param {{lat: number, lng: number}} a
 * @param {{lat: number, lng: number}} b
 * @returns {number} metres
 */
function distanceToSegment(p, a, b) {
  // Convert to local metres using equirectangular approx around point a
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const cosLat = Math.cos(toRad(a.lat));

  const ax = 0;
  const ay = 0;
  const bx = (b.lng - a.lng) * toRad(1) * R * cosLat;
  const by = (b.lat - a.lat) * toRad(1) * R;
  const px = (p.lng - a.lng) * toRad(1) * R * cosLat;
  const py = (p.lat - a.lat) * toRad(1) * R;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return Math.sqrt(px * px + py * py);
  }

  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

/**
 * Generate a simple unique id.
 * @returns {string}
 */
export function generateId() {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 9)
  );
}

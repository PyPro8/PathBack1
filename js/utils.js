/**
 * TrailTrace — pure geometry & helper utilities
 */

const R = 6371000; // Earth radius metres

export function haversine(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function pathDistance(points) {
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversine(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
  }
  return total;
}

export function formatDistance(metres) {
  if (!Number.isFinite(metres) || metres < 0) return '0.00';
  if (metres < 1000) return Math.round(metres) + ' m';
  return (metres / 1000).toFixed(2) + ' km';
}

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

export function formatTimestamp(ts) {
  try {
    return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

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
 * GPS point acceptance filter.
 */
export function shouldAcceptPoint(newPoint, lastPoint, opts = {}) {
  const MIN_DISTANCE_M = opts.minDistance ?? 3;
  const MAX_JUMP_M = opts.maxJump ?? 250;
  const MAX_ACCURACY_M = opts.maxAccuracy ?? 120;

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
  if (!lastPoint) return { accept: true };

  const dist = haversine(lastPoint.lat, lastPoint.lng, newPoint.lat, newPoint.lng);
  if (dist < MIN_DISTANCE_M) return { accept: false, reason: 'too_close' };
  if (dist > MAX_JUMP_M) return { accept: false, reason: 'jump_too_large' };
  return { accept: true };
}

export function reverseRoute(points) {
  if (!Array.isArray(points)) return [];
  return [...points].reverse();
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

/**
 * Project lat/lng to local metres relative to origin (equirectangular).
 */
function toLocal(p, origin) {
  const toRad = (d) => (d * Math.PI) / 180;
  const cos = Math.cos(toRad(origin.lat));
  return {
    x: (p.lng - origin.lng) * toRad(1) * R * cos,
    y: (p.lat - origin.lat) * toRad(1) * R,
  };
}

/**
 * Distance from point to line segment (metres).
 * Returns { distance, t, closest } where t is 0..1 along segment.
 */
export function distanceToSegment(point, a, b) {
  const origin = a;
  const P = toLocal(point, origin);
  const A = { x: 0, y: 0 };
  const B = toLocal(b, origin);
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const lenSq = dx * dx + dy * dy;

  let t = 0;
  if (lenSq > 0) {
    t = ((P.x - A.x) * dx + (P.y - A.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }

  const cx = A.x + t * dx;
  const cy = A.y + t * dy;
  const dist = Math.sqrt((P.x - cx) ** 2 + (P.y - cy) ** 2);

  // Reconstruct lat/lng of closest point
  const toRad = (d) => (d * Math.PI) / 180;
  const cos = Math.cos(toRad(origin.lat));
  const closest = {
    lat: origin.lat + (cy / R) * (180 / Math.PI),
    lng: origin.lng + (cx / (R * cos)) * (180 / Math.PI),
  };

  return { distance: dist, t, closest };
}

/**
 * Nearest point on a polyline to a given position.
 * Uses nearest-segment (not just nearest vertex).
 * Returns { distance, closest, segmentIndex, t }
 */
export function nearestOnRoute(point, route) {
  if (!route || route.length === 0) {
    return { distance: Infinity, closest: null, segmentIndex: -1, t: 0 };
  }
  if (route.length === 1) {
    const d = haversine(point.lat, point.lng, route[0].lat, route[0].lng);
    return { distance: d, closest: { ...route[0] }, segmentIndex: 0, t: 0 };
  }

  let best = { distance: Infinity, closest: null, segmentIndex: -1, t: 0 };
  for (let i = 0; i < route.length - 1; i++) {
    const r = distanceToSegment(point, route[i], route[i + 1]);
    if (r.distance < best.distance) {
      best = {
        distance: r.distance,
        closest: r.closest,
        segmentIndex: i,
        t: r.t,
      };
    }
  }
  return best;
}

/**
 * Remaining distance along the route from the nearest point onward (towards end).
 * Assumes route is ordered in the direction of travel (e.g. reversed for retrace).
 */
export function remainingRouteDistance(point, route) {
  if (!route || route.length < 2) return 0;
  const near = nearestOnRoute(point, route);
  if (near.segmentIndex < 0) return pathDistance(route);

  let remaining = 0;
  // Distance from closest point to end of current segment
  const segEnd = route[near.segmentIndex + 1];
  remaining += haversine(near.closest.lat, near.closest.lng, segEnd.lat, segEnd.lng);

  // Rest of the route
  for (let i = near.segmentIndex + 1; i < route.length - 1; i++) {
    remaining += haversine(route[i].lat, route[i].lng, route[i + 1].lat, route[i + 1].lng);
  }
  return remaining;
}

/**
 * Progress along route 0..1 based on distance travelled from start of route.
 */
export function routeProgress(point, route) {
  const total = pathDistance(route);
  if (total <= 0) return 0;
  const remaining = remainingRouteDistance(point, route);
  return Math.max(0, Math.min(1, 1 - remaining / total));
}

/**
 * Bearing from point A to B in degrees (0 = north, 90 = east).
 */
export function bearing(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Smooth heading (circular mean-ish) to reduce jitter.
 * @param {number} prev previous heading degrees
 * @param {number} next new heading degrees
 * @param {number} alpha 0..1 smoothing factor (higher = more responsive)
 */
export function smoothHeading(prev, next, alpha = 0.25) {
  if (prev == null || !Number.isFinite(prev)) return next;
  let diff = ((next - prev + 540) % 360) - 180;
  return (prev + alpha * diff + 360) % 360;
}

/**
 * Destination reached? Within radius of target, with simple consecutive-count hysteresis.
 */
export function isNearDestination(point, target, radiusM = 25) {
  if (!point || !target) return false;
  return haversine(point.lat, point.lng, target.lat, target.lng) <= radiusM;
}

export function distanceToRoute(point, route) {
  return nearestOnRoute(point, route).distance;
}

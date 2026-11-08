/**
 * PathBack — Automated unit tests for core utilities.
 * Run with: node tests/utils.test.js
 * (No external test runner required.)
 */

import {
  haversine,
  pathDistance,
  formatDistance,
  formatDuration,
  isValidCoordinate,
  shouldAcceptPoint,
  reverseRoute,
  distanceToRoute,
  generateId,
} from '../js/utils.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function assertClose(actual, expected, tolerance, message) {
  const ok = Math.abs(actual - expected) <= tolerance;
  assert(ok, `${message} (got ${actual}, expected ~${expected})`);
}

console.log('\n=== PathBack Unit Tests ===\n');

// ── Haversine ──────────────────────────────────────────
console.log('Haversine distance');
{
  // Same point
  assertClose(haversine(0, 0, 0, 0), 0, 0.01, 'same point → 0');

  // ~1 degree latitude ≈ 111.2 km
  const d1 = haversine(0, 0, 1, 0);
  assertClose(d1, 111195, 200, '1° latitude ≈ 111.2 km');

  // Known short distance: roughly 100 m north
  const d2 = haversine(51.5, -0.12, 51.5009, -0.12);
  assertClose(d2, 100, 5, '~100 m north of London');

  // Antimeridian-ish (should still work)
  const d3 = haversine(0, 179.9, 0, -179.9);
  assert(d3 < 30000, 'near antimeridian short distance');
}

// ── pathDistance ───────────────────────────────────────
console.log('\nPath distance');
{
  assert(pathDistance([]) === 0, 'empty → 0');
  assert(pathDistance([{ lat: 0, lng: 0 }]) === 0, 'single point → 0');

  const pts = [
    { lat: 0, lng: 0 },
    { lat: 0.001, lng: 0 },
    { lat: 0.002, lng: 0 },
  ];
  const total = pathDistance(pts);
  const expected = haversine(0, 0, 0.001, 0) + haversine(0.001, 0, 0.002, 0);
  assertClose(total, expected, 0.1, 'sum of segments');
}

// ── formatDistance / formatDuration ────────────────────
console.log('\nFormatting');
{
  assert(formatDistance(1500) === '1.50', '1500 m → 1.50 km');
  assert(formatDistance(0) === '0.00', '0 → 0.00');
  assert(formatDuration(0) === '00:00', '0 ms');
  assert(formatDuration(65000) === '01:05', '65 s → 01:05');
  assert(formatDuration(3661000) === '01:01:01', '1h 1m 1s');
}

// ── isValidCoordinate ──────────────────────────────────
console.log('\nCoordinate validation');
{
  assert(isValidCoordinate(0, 0) === true, '0,0 valid');
  assert(isValidCoordinate(51.5, -0.12) === true, 'London valid');
  assert(isValidCoordinate(90, 180) === true, 'extremes valid');
  assert(isValidCoordinate(-90, -180) === true, 'south extremes valid');
  assert(isValidCoordinate(91, 0) === false, 'lat > 90 invalid');
  assert(isValidCoordinate(0, 181) === false, 'lng > 180 invalid');
  assert(isValidCoordinate(NaN, 0) === false, 'NaN invalid');
  assert(isValidCoordinate('51', 0) === false, 'string invalid');
}

// ── shouldAcceptPoint ──────────────────────────────────
console.log('\nGPS point filtering');
{
  const a = { lat: 51.5, lng: -0.12, accuracy: 10 };

  // First point always accepted
  assert(shouldAcceptPoint(a, null).accept === true, 'first point accepted');

  // Too close
  const close = { lat: 51.50001, lng: -0.12, accuracy: 10 };
  const r1 = shouldAcceptPoint(close, a, { minDistance: 3 });
  assert(r1.accept === false && r1.reason === 'too_close', 'too close rejected');

  // Legitimate ~50 m move
  const far = { lat: 51.50045, lng: -0.12, accuracy: 10 };
  const r2 = shouldAcceptPoint(far, a, { minDistance: 3, maxJump: 200 });
  assert(r2.accept === true, '50 m move accepted');

  // Huge jump
  const jump = { lat: 52.0, lng: -0.12, accuracy: 10 };
  const r3 = shouldAcceptPoint(jump, a, { maxJump: 200 });
  assert(r3.accept === false && r3.reason === 'jump_too_large', 'huge jump rejected');

  // Poor accuracy
  const badAcc = { lat: 51.5005, lng: -0.12, accuracy: 250 };
  const r4 = shouldAcceptPoint(badAcc, a, { maxAccuracy: 100 });
  assert(r4.accept === false && r4.reason === 'poor_accuracy', 'poor accuracy rejected');

  // Invalid
  const inv = { lat: 999, lng: 0 };
  assert(shouldAcceptPoint(inv, null).accept === false, 'invalid coords rejected');
}

// ── reverseRoute ───────────────────────────────────────
console.log('\nRoute reversal');
{
  const route = [
    { lat: 1, lng: 1 },
    { lat: 2, lng: 2 },
    { lat: 3, lng: 3 },
  ];
  const rev = reverseRoute(route);
  assert(rev.length === 3, 'same length');
  assert(rev[0].lat === 3 && rev[2].lat === 1, 'order reversed');
  assert(route[0].lat === 1, 'original not mutated');
  assert(reverseRoute([]).length === 0, 'empty stays empty');
  assert(Array.isArray(reverseRoute(null)), 'null → []');
}

// ── distanceToRoute ────────────────────────────────────
console.log('\nDeviation / distance to route');
{
  const route = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0.001 }, // ~111 m east
  ];

  // Point on the route
  const on = { lat: 0, lng: 0.0005 };
  const dOn = distanceToRoute(on, route);
  assert(dOn < 5, 'point on segment ≈ 0 m');

  // Point ~50 m north of midpoint
  const off = { lat: 0.00045, lng: 0.0005 };
  const dOff = distanceToRoute(off, route);
  assert(dOff > 40 && dOff < 60, `~50 m off path (got ${dOff.toFixed(1)} m)`);

  // Empty route
  assert(distanceToRoute({ lat: 0, lng: 0 }, []) === Infinity, 'empty route → Infinity');
}

// ── generateId ─────────────────────────────────────────
console.log('\nID generation');
{
  const id1 = generateId();
  const id2 = generateId();
  assert(typeof id1 === 'string' && id1.length > 5, 'id is non-empty string');
  assert(id1 !== id2, 'ids are unique');
}

// ── Summary ────────────────────────────────────────────
console.log('\n────────────────────────────');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('────────────────────────────\n');

if (failed > 0) {
  process.exit(1);
}

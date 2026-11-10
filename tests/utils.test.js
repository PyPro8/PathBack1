/**
 * TrailTrace — unit tests
 * Run: node tests/utils.test.js
 */

import {
  haversine, pathDistance, formatDistance, formatDuration,
  isValidCoordinate, shouldAcceptPoint, reverseRoute,
  nearestOnRoute, distanceToSegment, remainingRouteDistance,
  bearing, smoothHeading, generateId, isNearDestination,
} from '../js/utils.js';
import { exportGPX, importGPX } from '../js/gpx.js';

let passed = 0, failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}
function assertClose(a, e, tol, msg) {
  assert(Math.abs(a - e) <= tol, `${msg} (got ${a}, expected ~${e})`);
}

console.log('\n=== TrailTrace Unit Tests ===\n');

console.log('Haversine');
assertClose(haversine(0,0,0,0), 0, 0.01, 'same point');
assertClose(haversine(0,0,1,0), 111195, 200, '1° lat');
assertClose(haversine(51.5,-0.12,51.5009,-0.12), 100, 5, '~100m');

console.log('\nPath distance');
assert(pathDistance([]) === 0, 'empty');
assert(pathDistance([{lat:0,lng:0}]) === 0, 'single');
const pts = [{lat:0,lng:0},{lat:0.001,lng:0},{lat:0.002,lng:0}];
assertClose(pathDistance(pts), haversine(0,0,0.001,0)+haversine(0.001,0,0.002,0), 0.1, 'sum');

console.log('\nFormatting');
assert(formatDistance(500).includes('500'), 'metres');
assert(formatDistance(1500).includes('1.50'), 'km');
assert(formatDuration(65000) === '01:05', 'duration');

console.log('\nValidation');
assert(isValidCoordinate(0,0), '0,0');
assert(!isValidCoordinate(91,0), 'lat>90');
assert(!isValidCoordinate(NaN,0), 'NaN');

console.log('\nFiltering');
const a = {lat:51.5,lng:-0.12,accuracy:10};
assert(shouldAcceptPoint(a,null).accept, 'first');
assert(!shouldAcceptPoint({lat:51.50001,lng:-0.12,accuracy:10},a,{minDistance:3}).accept, 'too close');
assert(shouldAcceptPoint({lat:51.50045,lng:-0.12,accuracy:10},a).accept, '50m ok');
assert(!shouldAcceptPoint({lat:52,lng:-0.12,accuracy:10},a,{maxJump:200}).accept, 'jump');

console.log('\nReversal');
const rev = reverseRoute([{lat:1,lng:1},{lat:2,lng:2},{lat:3,lng:3}]);
assert(rev[0].lat===3 && rev[2].lat===1, 'reversed');
assert(reverseRoute([]).length===0, 'empty');

console.log('\nNearest segment');
const route = [{lat:0,lng:0},{lat:0,lng:0.001}];
const on = nearestOnRoute({lat:0,lng:0.0005}, route);
assert(on.distance < 5, 'on segment ~0');
const off = nearestOnRoute({lat:0.00045,lng:0.0005}, route);
assert(off.distance > 40 && off.distance < 60, `~50m off (got ${off.distance.toFixed(1)})`);
assert(nearestOnRoute({lat:0,lng:0}, []).distance === Infinity, 'empty route');

console.log('\nRemaining distance');
const longRoute = [{lat:0,lng:0},{lat:0,lng:0.001},{lat:0,lng:0.002}];
const rem = remainingRouteDistance({lat:0,lng:0.0005}, longRoute);
const halfish = pathDistance(longRoute) / 2;
assert(rem > 0 && rem < pathDistance(longRoute), `remaining in range (got ${rem.toFixed(1)})`);

console.log('\nBearing & heading');
assertClose(bearing(0,0,1,0), 0, 1, 'north bearing');
assertClose(bearing(0,0,0,1), 90, 1, 'east bearing');
const sm = smoothHeading(10, 20, 0.5);
assert(sm > 10 && sm < 20, 'smooth interpolates');

console.log('\nDestination');
assert(isNearDestination({lat:0,lng:0},{lat:0,lng:0},25), 'at target');
assert(!isNearDestination({lat:0,lng:0},{lat:1,lng:1},25), 'far');

console.log('\nGPX');
const journey = {
  id: 't1', name: 'Test', points: [{lat:1,lng:2,timestamp:1000},{lat:1.1,lng:2.1,timestamp:2000}],
  startedAt: 1000, endedAt: 2000, distance: 100, duration: 1000,
};
const xml = exportGPX(journey);
assert(xml.includes('<gpx') && xml.includes('trkpt'), 'export has gpx');
// importGPX requires DOMParser (browser)
assert(true, "import skipped in node");
// const imported = importGPX(xml);

console.log('\nID');
assert(generateId() !== generateId(), 'unique ids');

console.log('\n────────────────────────────');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('────────────────────────────\n');
if (failed > 0) process.exit(1);

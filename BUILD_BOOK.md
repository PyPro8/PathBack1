# TrailTrace — Build Book

Architecture and implementation notes for the upgraded product (from PathBack).

## Architecture

Single-page app, no backend. Modules:

| Module | Role |
|--------|------|
| `gps.js` | One Geolocation watcher; event bus for point/accuracy/error |
| `utils.js` | Haversine, nearest-segment, remaining distance, bearing, filters |
| `storage.js` | IndexedDB: journeys, active session, waypoints |
| `schematic.js` | Canvas map: zoom, pan, heading-up rotation, connector |
| `leaflet-map.js` | Leaflet + OSM; route/user/connector overlays |
| `compass.js` | DeviceOrientation + GPS course, smoothed |
| `gpx.js` | Export/import GPX 1.1 |
| `app.js` | State machine, UI, orchestration |

## GPS

`watchPosition` with `enableHighAccuracy`. Points filtered by `shouldAcceptPoint` (min distance, max jump, max accuracy). Active recording is periodically written to the `session` store for recovery after reload.

## Navigation camera

- **Schematic:** follow mode centres on user; heading-up applies canvas rotation so travel direction is up; manual pan/zoom disables follow until Recenter.
- **Real map:** Leaflet `setView` on user when follow is on. Full tile rotation is not applied (Leaflet limitation without extra plugins); route styling distinguishes retrace.

## Deviation connector

`nearestOnRoute` walks segments (not only vertices). If distance > threshold + GPS accuracy → OFF ROUTE; intermediate band → RECONNECTING. Amber dashed line from user to closest point on the return polyline. Not a routing path.

## Retrace

`reverseRoute` copies and reverses coordinates. Remaining distance uses `remainingRouteDistance` from the nearest point forward along the reversed polyline.

## Compass

Prefers device absolute orientation / `webkitCompassHeading`; falls back to GPS `coords.heading` or computed bearing between successive points. Smoothed with circular interpolation.

## Offline

Schematic, stored journeys, retrace, deviation, and GPS continue without network. Real map tiles need connectivity. Connection badge reflects `navigator.onLine`.

## Wake Lock

`navigator.wakeLock.request('screen')` while recording/retracing; released on stop; re-requested on visibility change.

## Maps configuration

Tile URL lives in `leaflet-map.js`. Swap provider without touching navigation logic. Always keep OSM attribution when using OSM tiles.

## Testing

`node tests/utils.test.js` — pure geometry and GPX export. Manual device tests required for live GPS, compass permission, map interaction, and recovery.

## Product rename

User-facing strings, title, manifest, and docs use **TrailTrace**. Technical DB name is `TrailTraceDB` (new). PathBack DB is not migrated automatically.

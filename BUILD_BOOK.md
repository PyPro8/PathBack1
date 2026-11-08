# PathBack — Build Book

Architectural decisions, internals, and extension guide for Version 1.0.

---

## 1. Architectural Decisions

### Why pure frontend?

Version 1 only needs device GPS and local persistence. A backend would add deployment, auth, and cost with no product value yet. IndexedDB gives durable storage without accounts.

### Why no map provider?

Product requirement: avoid Google Maps, Mapbox, OSM tiles, and paid APIs. The visualization is intentionally schematic so users understand it is not a street map. This also keeps the app free of API keys and licensing constraints.

### Why vanilla JS modules?

Minimal surface area, zero build step for development, easy to audit, and straightforward to later wrap in a bundler or native shell. Each concern lives in its own file.

### Module responsibilities

| File              | Responsibility                                      |
|-------------------|-----------------------------------------------------|
| `app.js`          | UI state machine, event wiring, orchestration       |
| `gps.js`          | Geolocation watch/clear, point stream               |
| `storage.js`      | IndexedDB open/CRUD for journeys                    |
| `visualization.js`| Canvas projection and drawing                       |
| `utils.js`        | Pure geometry, formatting, filtering (testable)     |

---

## 2. GPS Tracking

### Flow

1. User enters a name and taps **Start Tracking**.
2. `GPSTracker.start()` calls `navigator.geolocation.watchPosition` with:
   - `enableHighAccuracy: true`
   - `maximumAge: 2000`
   - `timeout: 15000`
3. Each position is converted to `{ lat, lng, accuracy, timestamp, … }`.
4. `shouldAcceptPoint()` decides whether to keep it.
5. Accepted points are appended; the visualizer and stats update.

### Filtering rules (`shouldAcceptPoint`)

| Rule            | Default        | Purpose                                      |
|-----------------|----------------|----------------------------------------------|
| Valid coords    | lat ∈ [-90,90], lng ∈ [-180,180] | Reject garbage |
| Min distance    | 3 m            | Suppress stationary noise / jitter           |
| Max jump        | 200 m          | Drop obvious satellite jumps                |
| Max accuracy    | 100 m          | Ignore very poor fixes                       |

First point is always accepted. Legitimate walking/running speeds stay under the jump threshold for typical GPS update rates.

### Important browser behaviour

- Geolocation requires a **secure context** (HTTPS or `localhost`).
- Mobile browsers commonly **pause** watchPosition when the tab is backgrounded or the screen is locked. The UI notice states this; Version 1 does not claim background reliability.

---

## 3. Coordinate Storage

Journeys are stored in IndexedDB database `PathBackDB`, object store `journeys`, keyPath `id`.

### Journey shape

```js
{
  id: string,           // generateId()
  name: string,
  points: [             // ordered array
    { lat, lng, accuracy?, timestamp?, altitude?, speed? },
    …
  ],
  startedAt: number,    // ms epoch
  endedAt: number,
  distance: number,     // metres (Haversine path sum)
  duration: number      // ms
}
```

Indexes exist on `startedAt` and `name` for future queries. All data remains on-device.

---

## 4. Route Visualization

`RouteVisualizer` draws on an HTML Canvas.

### Projection

1. Collect all points (route + optional current position).
2. Compute bounding box in lat/lng.
3. Apply a simple equirectangular-style scale that respects approximate aspect ratio using `cos(midLat)`.
4. Fit the box into the canvas with padding; invert Y so higher latitude is higher on screen.

### Markers

- **S** (green) — first point of the displayed path.
- **D** (red) — last point of the displayed path.
- Blue filled circle — live current position (when available).

### Modes

- `record` / `view` — solid dark path.
- `retrace` — dashed blue path (return direction).

The canvas is labelled “Schematic route (not a real map)” so users never mistake it for cartography.

---

## 5. Reverse Navigation (“Retrace My Steps”)

1. Load the saved journey.
2. `reverseRoute(points)` produces a new array (original is not mutated).
3. Visualizer draws the reversed path in retrace style.
4. User taps **Start Retracing** → GPS watch begins again.
5. Live position is overlaid; deviation checks run on each update.

**Important product note:** Reversing coordinates does not guarantee a safe or legal return path. Version 1 does not provide turn-by-turn instructions or obstacle awareness.

---

## 6. Deviation Detection

On each live position while retracing:

```js
dist = distanceToRoute(current, reversedRoute)
threshold = 40 + (current.accuracy || 20)
if (dist > threshold) → show warning
```

`distanceToRoute` walks every segment and uses a local equirectangular projection to estimate distance from the point to the nearest segment. The accuracy buffer reduces false alarms when GPS is noisy.

This is intentionally basic and should be treated as a soft advisory, not a navigation guarantee.

---

## 7. Distance Calculation

Haversine formula (great-circle distance on a sphere of radius 6 371 000 m):

```
a = sin²(Δlat/2) + cos(lat1)·cos(lat2)·sin²(Δlon/2)
c = 2 · atan2(√a, √(1−a))
d = R · c
```

`pathDistance` sums consecutive segments. Results are stored in metres and displayed in kilometres to two decimal places.

---

## 8. How to Extend

### Add a backend later

- Keep `storage.js` as the local adapter.
- Introduce a `sync.js` that pushes/pulls journeys when the user is authenticated.
- Do not replace IndexedDB until cloud is the source of truth.

### Native apps

- Reuse the pure logic in `utils.js` and the journey schema.
- Replace `gps.js` with platform location APIs that support background updates.
- Canvas visualization can be ported to a native canvas or kept in a WebView for a hybrid approach.

### Better maps (future)

- Feature-flag a map layer (Mapbox / OSM) behind a setting.
- Keep the schematic view as a free / offline fallback.

### Voice / turn-by-turn

- Requires a routing engine or pre-computed bearing sequence along the reversed polyline.
- Out of scope for V1; the current reverse path is only visual + deviation.

### Export

- Add a “Export GPX” button that serializes `points` to GPX 1.1 XML and triggers a download.

---

## 9. Testing Discipline

- Pure functions live in `utils.js` and are covered by `tests/utils.test.js`.
- Run tests with `node tests/utils.test.js` before any release.
- GPS, IndexedDB, and UI behaviour require **manual** device testing; automated tests cannot fully substitute real hardware GPS.
- When fixing a bug in filtering, distance, or reversal, add a regression assertion in the unit suite.

---

## 10. Security & Privacy Notes

- Location data never leaves the device in Version 1.
- No third-party analytics or map SDKs.
- Users can delete any journey at any time.
- Future cloud features must obtain explicit consent and document data handling.

---

*Document maintained alongside the code. Update this file whenever architecture or core behaviour changes.*

# TrailTrace

**Every journey remembered. Every way found.**

TrailTrace is a GPS navigation and journey-recording web application. Record routes as you explore, save them locally, and later retrace your steps with live deviation guidance.

Upgraded from PathBack v1.0 into a fuller navigation experience.

---

## Features

- **GPS journey recording** — high-accuracy Geolocation with filtering for duplicates, jumps, and poor accuracy
- **Real map** — Leaflet + OpenStreetMap tiles (roads, paths, surroundings)
- **Schematic map** — offline-capable canvas route view with zoom, pan, and rotation
- **Heading-up navigation** — map orients to direction of travel; north-up available
- **Retrace My Steps** — reverse a saved route and follow it back
- **Deviation connector** — line from your position to the nearest point on the return route; ON/OFF/RECONNECTING status
- **Compass** — device orientation + GPS course
- **Remaining distance** — along the recorded route (not straight-line)
- **Waypoints** — mark important points during recording
- **GPX export / import**
- **Journey recovery** — interrupted recordings can be restored after reload
- **Screen Wake Lock** — keeps screen on during navigation where supported
- **Installable PWA** — Add to Home Screen
- **Local-only storage** — IndexedDB, no account required

---

## Technology

| Area | Choice |
|------|--------|
| UI | HTML, CSS, vanilla JS (ES modules) |
| Real map | Leaflet 1.9 + OSM tiles |
| Schematic map | HTML Canvas |
| Storage | IndexedDB |
| GPS | Browser Geolocation API |
| Heading | DeviceOrientation + GPS course |
| PWA | manifest + service worker |

No backend required for this version.

---

## Project structure

```
trailtrace/
├── index.html
├── manifest.json
├── sw.js
├── css/styles.css
├── icons/
├── js/
│   ├── app.js           # Controller
│   ├── gps.js           # GPS service
│   ├── storage.js       # IndexedDB
│   ├── utils.js         # Geometry
│   ├── schematic.js     # Canvas map
│   ├── leaflet-map.js   # Real map
│   ├── compass.js
│   └── gpx.js
├── tests/utils.test.js
├── README.md
└── BUILD_BOOK.md
```

---

## Run locally

```bash
cd trailtrace
python -m http.server 8080
# open http://localhost:8080
```

**Requirements:** modern browser, HTTPS or localhost for Geolocation, location permission.

### Install as app (PWA)

Serve over HTTPS (e.g. Netlify Drop), then:

- **Android Chrome:** menu → Install app / Add to Home screen  
- **iOS Safari:** Share → Add to Home Screen  

---

## Tests

```bash
node tests/utils.test.js
```

Covers Haversine, filtering, nearest-segment, remaining distance, bearing, GPX export, etc.

**Manual testing** on a real Android device is required for GPS, compass, maps, and retrace.

---

## Known limitations

- Browser GPS is paused when the tab is backgrounded or the screen locks; this is not a native background tracker.
- Real map tiles require internet; schematic mode works offline.
- OSM tiles: fair-use only; tile URL is configurable for production providers.
- Heading-up fully rotates the schematic map; real map follows position (Leaflet north-up base).
- Deviation connector is a straight geographic link, not a guaranteed walkable path.
- No turn-by-turn voice navigation in this version.

---

## Map attribution

Real map tiles © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.

---

## Future direction

Native Android app, offline tile packs, cloud sync, accounts, team tracking (with consent), richer navigation cues.

# PathBack

**Go explore. We'll remember the way.**

PathBack is a mobile-first GPS route recording and retracing web application. It records your movements using the device GPS, stores journeys locally, and lets you reverse a saved route so you can find your way back.

Version 1.0 — intentional product foundation, not a throwaway demo.

---

## Features

- **GPS Tracking** — Browser Geolocation API with high-accuracy mode, sensible filtering of duplicates and GPS jumps.
- **Live statistics** — Distance (Haversine), duration, point count, current accuracy.
- **Schematic route visualization** — Custom HTML Canvas plot of the path (not a real map). Start (S), Destination (D), and current position are marked.
- **Save journeys** — Name, coordinates, timestamps, distance, and duration stored in IndexedDB. No account required.
- **Journey history** — List, view, rename, and delete saved journeys. Data survives page refresh.
- **Retrace My Steps** — Reverse the recorded coordinates and display the return path. Visually distinct dashed blue line.
- **Deviation warning** — While retracing, warns if you drift too far from the recorded trail (accounts for GPS accuracy).
- **Mobile-first UI** — Clean light theme, deep navy text, blue accents, optimized for phone browsers.

---

## Technology Stack

| Layer        | Choice                          |
|--------------|---------------------------------|
| Markup       | HTML5                           |
| Styles       | CSS3 (custom properties)        |
| Logic        | Vanilla ES modules (JavaScript) |
| Storage      | IndexedDB                       |
| Visualization| HTML Canvas                     |
| GPS          | Browser Geolocation API         |
| Tests        | Node.js (no extra runner)       |

No frameworks, no external map providers, no backend required for Version 1.

---

## Project Structure

```
pathback/
├── index.html              # App shell
├── css/
│   └── styles.css          # Mobile-first styles
├── js/
│   ├── app.js              # Main controller
│   ├── gps.js              # Geolocation wrapper
│   ├── storage.js          # IndexedDB persistence
│   ├── visualization.js    # Canvas route plotter
│   └── utils.js            # Haversine, filtering, etc.
├── tests/
│   └── utils.test.js       # Automated unit tests
├── README.md
└── BUILD_BOOK.md
```

---

## Installation & Running Locally

### Requirements

- A modern browser (Chrome, Firefox, Safari, Edge — recent versions).
- For GPS: a device with location services, or a browser that can mock geolocation.
- **HTTPS or localhost** — Geolocation is blocked on plain HTTP origins (except localhost).

### Quick start

1. Clone or extract the project.
2. Serve the folder over HTTP (required for modules + geolocation):

```bash
# Python 3
cd pathback
python -m http.server 8080

# Or Node
npx serve .
```

3. Open `http://localhost:8080` on your phone or desktop.

### Testing GPS on a phone

1. Open the app on your Android/iOS browser over HTTPS or a local network address served via HTTPS if possible (or use localhost with USB debugging / port forwarding).
2. Allow location permission when prompted.
3. Keep the screen on and the tab in the foreground while recording.
4. Walk a short loop, stop & save, then open the journey and press **Retrace My Steps**.

Desktop browsers can use the developer tools “Sensors” / “Geolocation” override to simulate movement.

---

## Running Tests

```bash
cd pathback
node tests/utils.test.js
```

Expected output ends with `Passed: N` and `Failed: 0`.

Tests cover:

- Haversine distance
- Path distance aggregation
- Coordinate validation
- GPS point filtering (duplicates, jumps, accuracy)
- Route reversal
- Distance-to-route (deviation helper)
- Duration / distance formatting
- ID generation

**Manual testing** (required for full confidence):

- Real GPS recording on a mobile device
- Permission denied / timeout behaviour
- IndexedDB persistence across refresh
- Retrace + deviation warning while walking off path

---

## Known Limitations (Version 1)

- **No real map tiles** — Visualization is schematic only.
- **No background tracking** — Mobile browsers suspend Geolocation when the tab is backgrounded or the screen locks. The app states this clearly.
- **No turn-by-turn or voice guidance**.
- **No accounts / cloud sync** — Data stays on the device.
- **Deviation detection is basic** — Distance-to-polyline with an accuracy buffer; not a full navigation engine.
- **Reversing coordinates is not guaranteed safe navigation** — Obstacles, one-way paths, and terrain are not considered.

---

## Future Roadmap

- User accounts and cloud synchronization
- Offline map tiles (optional)
- Native Android / iOS apps with reliable background tracking
- Voice prompts and basic navigation cues
- Journey export (GPX / GeoJSON)
- Subscription plans for premium features

---

## License

Proprietary — intended for commercialization. All rights reserved for the PathBack product.

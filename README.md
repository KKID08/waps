# WAPS — Navigation

A polished, smooth navigation web app built entirely on **OpenStreetMap** data.
Plan and follow routes for **car**, **bike** and **on foot** — with live
turn-by-turn guidance, voice instructions and a clean, modern UI.

![profiles: car · bike · foot](https://img.shields.io/badge/profiles-car%20%C2%B7%20bike%20%C2%B7%20foot-2563eb)

## Features

- 🗺️ **Smooth vector map** — GPU-rendered with [MapLibre GL JS](https://maplibre.org)
  and key-less [OpenFreeMap](https://openfreemap.org) tiles (light & dark themes).
- 🔎 **Smart search** — address & place autocomplete via Nominatim, with map-view bias.
- 🚗🚲🚶 **Three transport modes** — driving, cycling and walking, each with its own
  routing profile and live ETA shown on the mode chips.
- 🧭 **Turn-by-turn routing** — real maneuvers from [Valhalla](https://valhalla.github.io),
  with maneuver icons, distances and an expandable step list.
- 🔀 **Alternative routes** — pick the fastest or an alternate, drawn on the map.
- 📍 **Live navigation mode** — follows your GPS with a 3D-pitched, heading-up camera,
  a maneuver banner, remaining time / distance / arrival, **voice guidance**
  (Web Speech API, German) and automatic **off-route rerouting**.
- 📌 **Flexible input** — search, tap the map to drop a destination, use your current
  location, or swap start/end.
- 📱 **Responsive & touch-friendly** — glassmorphic panels, bottom sheet, safe-area aware.

## Run it

No build step and no API keys required.

```bash
npm start          # → http://localhost:5173
# or:
python3 -m http.server 5173
```

Then open the URL in a browser. For GPS / voice features use `localhost` or HTTPS
(browsers restrict geolocation on insecure origins).

## Architecture

```
index.html            App shell + CDN MapLibre / fonts
src/css/styles.css    Theme tokens, glass UI, navigation styling
src/js/
  config.js           Endpoints, map styles, transport profiles
  util.js             Formatting, geometry, polyline decode, snapping
  geocoding.js        Nominatim forward + reverse geocoding
  routing.js          Valhalla routing → decoded geometry + maneuvers
  maneuvers.js        Valhalla maneuver type → icon mapping
  map.js              MapLibre wrapper: layers, markers, camera
  navigation.js       Live GPS engine: snapping, progress, reroute, voice cues
  voice.js            Web Speech API wrapper (de-DE)
  app.js              Orchestrator wiring UI ↔ map ↔ routing ↔ navigation
server.js             Zero-dependency static dev server
```

## Data & services

All powered by free, OpenStreetMap-based services:

- **Map tiles** — OpenFreeMap
- **Geocoding** — Nominatim (OSM)
- **Routing** — Valhalla (FOSSGIS public instance)

Please respect each provider's usage policy. For production traffic, self-host
Valhalla / Nominatim or use a commercial tile/routing provider.

## License

MIT

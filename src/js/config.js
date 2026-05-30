// Central configuration for endpoints, styles and routing profiles.
// All services used here are free and OpenStreetMap-based (no API key required).

export const MAP_STYLES = {
  // OpenFreeMap — free, key-less OSM vector tiles served globally.
  light: 'https://tiles.openfreemap.org/styles/bright',
  dark: 'https://tiles.openfreemap.org/styles/dark',
  liberty: 'https://tiles.openfreemap.org/styles/liberty',
};

// Nominatim (OSM) for forward + reverse geocoding.
export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';

// Valhalla routing (FOSSGIS public instance) — supports auto / bicycle / pedestrian
// and returns rich turn-by-turn maneuvers.
export const VALHALLA_URL = 'https://valhalla1.openstreetmap.de';

// OSRM routing (FOSSGIS public instance) — used as a resilient fallback.
// Per-profile hosts: routed-car / routed-bike / routed-foot.
export const OSRM_URL = 'https://routing.openstreetmap.de';

// Transport profiles exposed in the UI. `costing` maps to Valhalla.
export const PROFILES = {
  car: {
    id: 'car',
    label: 'Auto',
    icon: 'directions_car',
    costing: 'auto',
    osrm: 'routed-car',
    color: '#2563eb',
    speedKmh: 50,
  },
  bike: {
    id: 'bike',
    label: 'Fahrrad',
    icon: 'directions_bike',
    costing: 'bicycle',
    osrm: 'routed-bike',
    color: '#059669',
    speedKmh: 16,
  },
  foot: {
    id: 'foot',
    label: 'Zu Fuß',
    icon: 'directions_walk',
    costing: 'pedestrian',
    osrm: 'routed-foot',
    color: '#d97706',
    speedKmh: 5,
  },
};

export const DEFAULT_CENTER = [13.405, 52.52]; // Berlin
export const DEFAULT_ZOOM = 12;

// A polite identifier for OSM service usage policies.
export const APP_NAME = 'WAPS Navigation';

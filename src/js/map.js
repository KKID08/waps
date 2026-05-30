// MapLibre GL map wrapper: style, route layers, markers, camera helpers.
import { MAP_STYLES, DEFAULT_CENTER, DEFAULT_ZOOM, PROFILES } from './config.js';

export class MapView {
  constructor(container, { theme = 'light' } = {}) {
    this.theme = theme;
    this.map = new maplibregl.Map({
      container,
      style: MAP_STYLES[theme],
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: false,
      pitchWithRotate: true,
      hash: false,
    });

    this.map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'bottom-right'
    );

    this._ready = new Promise((resolve) => this.map.on('load', resolve));
    this._sourcesAdded = false;
    this.markers = {};
  }

  ready() {
    return this._ready;
  }

  async setTheme(theme) {
    this.theme = theme;
    const state = this._snapshotData();
    await new Promise((resolve) => {
      const onData = () => {
        if (!this.map.isStyleLoaded()) return;
        this.map.off('styledata', onData);
        resolve();
      };
      this.map.on('styledata', onData);
      this.map.setStyle(MAP_STYLES[theme]);
    });
    this._sourcesAdded = false;
    this._ensureLayers();
    this._restoreData(state);
  }

  _snapshotData() {
    const get = (id) => {
      const src = this.map.getSource(id);
      return src && src._data ? src._data : null;
    };
    return {
      route: get('route'),
      routeAlt: get('route-alt'),
      traveled: get('route-traveled'),
    };
  }

  _restoreData(state) {
    if (state.routeAlt) this.map.getSource('route-alt').setData(state.routeAlt);
    if (state.route) this.map.getSource('route').setData(state.route);
    if (state.traveled) this.map.getSource('route-traveled').setData(state.traveled);
  }

  // Create route sources + layers once the style is loaded.
  _ensureLayers() {
    if (this._sourcesAdded) return;
    const empty = { type: 'FeatureCollection', features: [] };

    this.map.addSource('route-alt', { type: 'geojson', data: empty });
    this.map.addSource('route', { type: 'geojson', data: empty });
    this.map.addSource('route-traveled', { type: 'geojson', data: empty });

    // Alternative routes (dimmed).
    this.map.addLayer({
      id: 'route-alt',
      type: 'line',
      source: 'route-alt',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': this.theme === 'dark' ? '#64748b' : '#94a3b8',
        'line-width': 6,
        'line-opacity': 0.7,
      },
    });

    // Main route casing (outline) then fill for a crisp navigation look.
    this.map.addLayer({
      id: 'route-casing',
      type: 'line',
      source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#ffffff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 8, 16, 14],
        'line-opacity': this.theme === 'dark' ? 0.25 : 0.9,
      },
    });
    this.map.addLayer({
      id: 'route',
      type: 'line',
      source: 'route',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 16, 9],
      },
    });
    // Traveled portion (dimmed) drawn above for navigation progress.
    this.map.addLayer({
      id: 'route-traveled',
      type: 'line',
      source: 'route-traveled',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': this.theme === 'dark' ? '#475569' : '#cbd5e1',
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 16, 9],
      },
    });

    this._sourcesAdded = true;
  }

  setRoute(route, { profile } = {}) {
    this._ensureLayers();
    const color = route ? route.color : PROFILES[profile]?.color || '#2563eb';
    const data = route
      ? {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { color },
              geometry: { type: 'LineString', coordinates: route.coordinates },
            },
          ],
        }
      : { type: 'FeatureCollection', features: [] };
    this.map.getSource('route').setData(data);
  }

  setAlternatives(routes) {
    this._ensureLayers();
    const data = {
      type: 'FeatureCollection',
      features: (routes || []).map((r) => ({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: r.coordinates },
      })),
    };
    this.map.getSource('route-alt').setData(data);
  }

  // Show the already-traveled part during navigation.
  setTraveled(coords) {
    this._ensureLayers();
    const data =
      coords && coords.length > 1
        ? {
            type: 'FeatureCollection',
            features: [
              { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } },
            ],
          }
        : { type: 'FeatureCollection', features: [] };
    this.map.getSource('route-traveled').setData(data);
  }

  clearRoute() {
    this.setRoute(null);
    this.setAlternatives([]);
    this.setTraveled([]);
  }

  setMarker(id, coord, { className = '', html = '', anchor = 'bottom' } = {}) {
    if (!coord) {
      this.removeMarker(id);
      return;
    }
    if (this.markers[id]) {
      this.markers[id].setLngLat(coord);
      return this.markers[id];
    }
    const node = document.createElement('div');
    node.className = `map-marker ${className}`;
    node.innerHTML = html;
    const m = new maplibregl.Marker({ element: node, anchor })
      .setLngLat(coord)
      .addTo(this.map);
    this.markers[id] = m;
    return m;
  }

  removeMarker(id) {
    if (this.markers[id]) {
      this.markers[id].remove();
      delete this.markers[id];
    }
  }

  fitRoute(route, padding = { top: 90, bottom: 280, left: 60, right: 60 }) {
    if (!route || !route.coordinates.length) return;
    const bounds = route.coordinates.reduce(
      (b, c) => b.extend(c),
      new maplibregl.LngLatBounds(route.coordinates[0], route.coordinates[0])
    );
    this.map.fitBounds(bounds, { padding, duration: 900, maxZoom: 16 });
  }

  flyTo(opts) {
    this.map.flyTo({ duration: 800, essential: true, ...opts });
  }
}

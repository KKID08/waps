// WAPS — application orchestrator.
import { PROFILES } from './config.js';
import { $, debounce, formatDistance, formatDuration, formatArrival } from './util.js';
import { MapView } from './map.js';
import { searchPlaces, reverseGeocode } from './geocoding.js';
import { getRoute } from './routing.js';
import { Navigator } from './navigation.js';
import { Voice } from './voice.js';

const state = {
  profile: 'car',
  origin: null, // { coord:[lng,lat], label }
  destination: null,
  userLocation: null,
  routes: [],
  selected: 0,
  mode: 'plan', // 'plan' | 'nav'
  activeField: null, // 'origin' | 'dest'
  following: true,
  theme: localStorage.getItem('waps-theme') || 'light',
};

let mapView, voice, navi;

init();

async function init() {
  document.documentElement.setAttribute('data-theme', state.theme);
  mapView = new MapView('map', { theme: state.theme });
  voice = new Voice();

  await mapView.ready();
  mapView._ensureLayers();

  navi = new Navigator({
    onUpdate: onNavUpdate,
    onReroute: onReroute,
    onArrive: onArrive,
    speak: (t) => voice.say(t),
  });

  wireUI();
  setProfile('car');
  themeIcon();

  // Try to locate the user on launch (non-blocking).
  locateUser({ recenter: true, setOrigin: true }).catch(() => {});

  mapView.map.on('click', onMapClick);
  mapView.map.on('dragstart', () => {
    if (state.mode === 'nav') setFollowing(false);
  });
}

/* ============================ UI WIRING ============================ */
function wireUI() {
  // Profile chips
  $('#profiles').addEventListener('click', (e) => {
    const btn = e.target.closest('.profile');
    if (btn) setProfile(btn.dataset.profile);
  });

  // Search inputs
  const originInput = $('#origin-input');
  const destInput = $('#dest-input');
  const onInput = debounce((field, value) => runSearch(field, value), 280);

  originInput.addEventListener('focus', () => (state.activeField = 'origin'));
  destInput.addEventListener('focus', () => (state.activeField = 'dest'));
  originInput.addEventListener('input', (e) => onInput('origin', e.target.value));
  destInput.addEventListener('input', (e) => onInput('dest', e.target.value));
  destInput.addEventListener('keydown', suggestionKeys);
  originInput.addEventListener('keydown', suggestionKeys);

  $('#use-location').addEventListener('click', () =>
    locateUser({ recenter: false, setOrigin: true, force: true })
  );
  $('#clear-dest').addEventListener('click', () => {
    destInput.value = '';
    setDestination(null);
    hideSuggestions();
  });
  $('#swap').addEventListener('click', swapEndpoints);

  // Floating buttons
  $('#geolocate').addEventListener('click', () =>
    locateUser({ recenter: true, setOrigin: !state.origin, force: true })
  );
  $('#theme-toggle').addEventListener('click', toggleTheme);

  // Route sheet
  $('#go-btn').addEventListener('click', startNavigation);
  $('#steps-toggle').addEventListener('click', toggleSteps);

  // Navigation controls
  $('#nav-end').addEventListener('click', stopNavigation);
  $('#nav-recenter').addEventListener('click', () => setFollowing(true));
  $('#nav-voice').addEventListener('click', (e) => {
    const on = voice.toggle();
    e.currentTarget.classList.toggle('active', on);
    e.currentTarget.querySelector('.material-symbols-rounded').textContent = on
      ? 'volume_up'
      : 'volume_off';
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#planner')) hideSuggestions();
  });
}

/* ============================ PROFILES ============================ */
function setProfile(id) {
  state.profile = id;
  document.querySelectorAll('.profile').forEach((b) =>
    b.classList.toggle('active', b.dataset.profile === id)
  );
  if (state.origin && state.destination) computeRoute();
}

/* ============================ SEARCH ============================ */
async function runSearch(field, value) {
  state.activeField = field;
  if (!value || value.trim().length < 2) return hideSuggestions();
  try {
    const center = mapView.map.getCenter();
    const results = await searchPlaces(value.trim(), {
      center: [center.lng, center.lat],
    });
    renderSuggestions(results);
  } catch (err) {
    console.warn(err);
  }
}

function renderSuggestions(results) {
  const ul = $('#suggestions');
  ul.innerHTML = '';
  if (!results.length) return hideSuggestions();
  for (const r of results) {
    const li = document.createElement('li');
    li.className = 'suggestion';
    li.innerHTML = `
      <div class="s-icon"><span class="material-symbols-rounded">${iconFor(r)}</span></div>
      <div class="s-text">
        <div class="s-name">${escapeHtml(r.name)}</div>
        ${r.detail ? `<div class="s-detail">${escapeHtml(r.detail)}</div>` : ''}
      </div>`;
    li.addEventListener('click', () => pickSuggestion(r));
    ul.appendChild(li);
  }
  ul.hidden = false;
}

function suggestionKeys(e) {
  const items = Array.from(document.querySelectorAll('.suggestion'));
  if (!items.length) return;
  const cur = items.findIndex((i) => i.classList.contains('active'));
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setActiveItem(items, Math.min(cur + 1, items.length - 1));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setActiveItem(items, Math.max(cur - 1, 0));
  } else if (e.key === 'Enter') {
    e.preventDefault();
    items[cur >= 0 ? cur : 0].click();
  } else if (e.key === 'Escape') {
    hideSuggestions();
  }
}
function setActiveItem(items, idx) {
  items.forEach((i, n) => i.classList.toggle('active', n === idx));
  items[idx]?.scrollIntoView({ block: 'nearest' });
}

function pickSuggestion(r) {
  if (state.activeField === 'origin') {
    setOrigin({ coord: r.coord, label: r.label });
    $('#origin-input').value = r.label;
  } else {
    setDestination({ coord: r.coord, label: r.label });
    $('#dest-input').value = r.label;
  }
  hideSuggestions();
  document.activeElement?.blur();
}

function hideSuggestions() {
  const ul = $('#suggestions');
  ul.hidden = true;
  ul.innerHTML = '';
}

/* ============================ ENDPOINTS ============================ */
function setOrigin(place) {
  state.origin = place;
  if (place) {
    mapView.setMarker('origin', place.coord, {
      className: 'pin pin-origin',
      html: '<span class="material-symbols-rounded">trip_origin</span>',
    });
  } else {
    mapView.removeMarker('origin');
  }
  maybeRoute();
}

function setDestination(place) {
  state.destination = place;
  if (place) {
    mapView.setMarker('dest', place.coord, {
      className: 'pin pin-dest',
      html: '<span class="material-symbols-rounded">place</span>',
    });
    maybeRoute();
  } else {
    mapView.removeMarker('dest');
    clearRoute();
  }
}

function swapEndpoints() {
  const o = state.origin;
  const d = state.destination;
  $('#origin-input').value = d?.label || '';
  $('#dest-input').value = o?.label || '';
  setOrigin(d);
  setDestination(d ? o : null);
  if (d && o) computeRoute();
}

async function maybeRoute() {
  // If we have a destination but no origin, try the user's location first.
  if (state.destination && !state.origin) {
    try {
      await locateUser({ recenter: false, setOrigin: true });
    } catch {
      toast('Bitte Startpunkt wählen.');
      $('#origin-input').focus();
      return;
    }
  }
  if (state.origin && state.destination) computeRoute();
}

/* ============================ ROUTING ============================ */
let routeAbort;
async function computeRoute() {
  if (!state.origin || !state.destination) return;
  routeAbort?.abort();
  routeAbort = new AbortController();
  showLoading(true);
  try {
    const routes = await getRoute(
      state.origin.coord,
      state.destination.coord,
      state.profile,
      { signal: routeAbort.signal }
    );
    if (!routes.length) throw new Error('Keine Route gefunden.');
    state.routes = routes;
    state.selected = 0;
    renderRoute();
    await updateProfileEtas();
  } catch (err) {
    if (err.name !== 'AbortError') {
      toast(err.message || 'Routenfehler');
      clearRoute();
    }
  } finally {
    showLoading(false);
  }
}

function renderRoute() {
  const route = state.routes[state.selected];
  mapView.setAlternatives(state.routes.filter((_, i) => i !== state.selected));
  mapView.setRoute(route);
  mapView.setTraveled([]);
  mapView.fitRoute(route);
  renderSheet();
  showSheet(true);
}

function renderSheet() {
  const route = state.routes[state.selected];
  $('#route-time').textContent = formatDuration(route.duration);
  $('#route-dist').textContent = formatDistance(route.distance);
  $('#route-arrival').textContent = `Ankunft ${formatArrival(route.duration)} · ${
    PROFILES[state.profile].label
  }`;

  // Alternatives
  const alt = $('#alt-routes');
  alt.innerHTML = '';
  if (state.routes.length > 1) {
    state.routes.forEach((r, i) => {
      const btn = document.createElement('button');
      btn.className = 'alt-route' + (i === state.selected ? ' active' : '');
      btn.innerHTML = `<span class="a-time">${formatDuration(r.duration)}</span>
        <span class="a-dist">${formatDistance(r.distance)}${i === 0 ? ' · schnellste' : ''}</span>`;
      btn.addEventListener('click', () => {
        state.selected = i;
        renderRoute();
      });
      alt.appendChild(btn);
    });
  }

  renderSteps(route);
}

function renderSteps(route) {
  const ol = $('#steps');
  ol.innerHTML = '';
  for (const m of route.maneuvers) {
    const li = document.createElement('li');
    li.className = 'step';
    li.innerHTML = `
      <div class="step-icon"><span class="material-symbols-rounded">${m.icon}</span></div>
      <div class="step-body">
        <div class="step-instr">${escapeHtml(m.instruction || '')}</div>
        ${m.distance > 5 ? `<div class="step-dist">${formatDistance(m.distance)}</div>` : ''}
      </div>`;
    li.addEventListener('click', () =>
      mapView.flyTo({ center: m.coord, zoom: 16 })
    );
    ol.appendChild(li);
  }
}

function toggleSteps() {
  const ol = $('#steps');
  ol.hidden = !ol.hidden;
  const btn = $('#steps-toggle');
  btn.querySelector('.material-symbols-rounded').textContent = ol.hidden ? 'list' : 'expand_less';
  btn.childNodes[btn.childNodes.length - 1].textContent = ol.hidden
    ? ' Schritte anzeigen'
    : ' Schritte ausblenden';
}

// Compute ETA per profile to show on the chips (best-effort, parallel).
async function updateProfileEtas() {
  if (!state.origin || !state.destination) return;
  const entries = await Promise.allSettled(
    Object.keys(PROFILES).map(async (id) => {
      if (id === state.profile) return [id, state.routes[0].duration];
      const r = await getRoute(state.origin.coord, state.destination.coord, id, { alternates: 0 });
      return [id, r[0]?.duration];
    })
  );
  for (const e of entries) {
    if (e.status !== 'fulfilled' || !e.value) continue;
    const [id, dur] = e.value;
    const chip = document.querySelector(`.profile[data-profile="${id}"] .profile-eta`);
    if (chip && dur != null) chip.textContent = shortDuration(dur);
  }
}

function clearRoute() {
  state.routes = [];
  mapView.clearRoute();
  showSheet(false);
  document.querySelectorAll('.profile-eta').forEach((c) => (c.textContent = ''));
}

/* ============================ NAVIGATION ============================ */
function startNavigation() {
  const route = state.routes[state.selected];
  if (!route) return;
  state.mode = 'nav';
  setFollowing(true);

  $('#planner').classList.add('hidden-up');
  $('.fab-stack').style.display = 'none';
  showSheet(false);
  $('#nav-top').hidden = false;
  $('#nav-bottom').hidden = false;
  $('#nav-voice').classList.toggle('active', voice.enabled);

  mapView.removeMarker('origin');
  mapView.map.easeTo({ pitch: 58, zoom: 17.5, duration: 900 });

  navi.start(route);
  voice.say('Navigation gestartet.');
}

function stopNavigation() {
  navi.stop();
  state.mode = 'plan';
  $('#planner').classList.remove('hidden-up');
  $('.fab-stack').style.display = '';
  $('#nav-top').hidden = true;
  $('#nav-bottom').hidden = true;
  mapView.removeMarker('user');
  mapView.setTraveled([]);
  mapView.map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
  if (state.routes[state.selected]) {
    mapView.fitRoute(state.routes[state.selected]);
    showSheet(true);
  }
  if (state.origin) {
    mapView.setMarker('origin', state.origin.coord, {
      className: 'pin pin-origin',
      html: '<span class="material-symbols-rounded">trip_origin</span>',
    });
  }
}

function onNavUpdate(u) {
  if (u.error) {
    toast(u.error);
    return;
  }
  state.userLocation = u.coord;
  mapView.setMarker('user', u.snapped, { className: 'puck-wrap', html: '<div class="puck"></div>', anchor: 'center' });
  mapView.setTraveled(u.traveled);

  // Top maneuver banner
  if (u.next) {
    $('#nav-icon').textContent = u.next.icon;
    $('#nav-dist').textContent = formatDistance(u.distToManeuver);
    $('#nav-instr').textContent = u.next.instruction || '';
  }

  // Bottom stats
  $('#nav-eta').textContent = formatDuration(u.remainingTime);
  $('#nav-remaining').textContent = formatDistance(u.remaining);
  $('#nav-arrival').textContent = `Ankunft ${formatArrival(u.remainingTime)}`;

  // Camera follow
  if (state.following) {
    mapView.map.easeTo({
      center: u.snapped,
      bearing: u.heading ?? mapView.map.getBearing(),
      pitch: 58,
      duration: 600,
      easing: (t) => t,
    });
  }
}

async function onReroute(coord) {
  toast('Route wird neu berechnet…');
  try {
    const routes = await getRoute(coord, state.destination.coord, state.profile, { alternates: 0 });
    if (routes.length) {
      state.routes = [routes[0]];
      state.selected = 0;
      mapView.setRoute(routes[0]);
      mapView.setAlternatives([]);
      navi.route = routes[0];
      navi.spokenFor = new Set();
    }
  } catch {
    toast('Neuberechnung fehlgeschlagen.');
  }
}

function onArrive() {
  voice.say('Sie haben Ihr Ziel erreicht.');
  toast('🎉 Ziel erreicht!');
  setTimeout(stopNavigation, 1500);
}

function setFollowing(on) {
  state.following = on;
  $('#nav-recenter').hidden = on;
  $('#nav-recenter').classList.toggle('active', !on);
}

/* ============================ GEOLOCATION ============================ */
function locateUser({ recenter = false, setOrigin: asOrigin = false, force = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      if (force) toast('Standort nicht verfügbar.');
      return reject(new Error('no geolocation'));
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coord = [pos.coords.longitude, pos.coords.latitude];
        state.userLocation = coord;
        if (recenter) mapView.flyTo({ center: coord, zoom: 15 });
        if (asOrigin) {
          let label = 'Mein Standort';
          try {
            const r = await reverseGeocode(coord);
            label = r.name || label;
          } catch {}
          setOrigin({ coord, label });
          $('#origin-input').value = label;
        }
        resolve(coord);
      },
      (err) => {
        if (force) toast('Standortzugriff verweigert.');
        reject(err);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });
}

/* ============================ MAP CLICK ============================ */
async function onMapClick(e) {
  if (state.mode === 'nav') return;
  const coord = [e.lngLat.lng, e.lngLat.lat];
  setDestination({ coord, label: 'Ausgewählter Ort' });
  $('#dest-input').value = 'Ausgewählter Ort';
  try {
    const r = await reverseGeocode(coord);
    state.destination.label = r.label;
    $('#dest-input').value = r.label;
  } catch {}
}

/* ============================ THEME ============================ */
async function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('waps-theme', state.theme);
  document.documentElement.setAttribute('data-theme', state.theme);
  document.querySelector('meta[name=theme-color]').setAttribute(
    'content',
    state.theme === 'dark' ? '#0b1120' : '#f1f5f9'
  );
  themeIcon();
  await mapView.setTheme(state.theme);
  // Re-apply current data after style swap.
  if (state.routes[state.selected] && state.mode !== 'nav') {
    mapView.setAlternatives(state.routes.filter((_, i) => i !== state.selected));
    mapView.setRoute(state.routes[state.selected]);
  }
}
function themeIcon() {
  $('#theme-toggle .material-symbols-rounded').textContent =
    state.theme === 'dark' ? 'light_mode' : 'dark_mode';
}

/* ============================ HELPERS ============================ */
function showSheet(show) {
  $('#route-sheet').hidden = !show;
  $('.fab-stack').classList.toggle('lifted', show && state.mode === 'plan');
}
function showLoading(show) {
  $('#loading').hidden = !show;
}
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3200);
}
function iconFor(r) {
  const c = (r.category || '').toLowerCase();
  if (c === 'highway' || r.type === 'road') return 'road';
  if (c === 'amenity') return 'storefront';
  if (c === 'tourism') return 'attractions';
  if (c === 'railway') return 'train';
  if (['city', 'town', 'village', 'place'].includes(r.type) || c === 'place') return 'location_city';
  return 'location_on';
}
function shortDuration(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

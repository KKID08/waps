// Routing with automatic provider fallback for resilience.
//   1. Valhalla (FOSSGIS) — rich German turn instructions, all modes.
//   2. OSRM (FOSSGIS)      — fast, reliable fallback, all modes.
// Both are free, key-less and OpenStreetMap-based. Each provider returns the
// same normalized route shape so the rest of the app is provider-agnostic.
import { VALHALLA_URL, OSRM_URL, PROFILES } from './config.js';
import { decodePolyline, haversine } from './util.js';
import { maneuverIcon, isDestination } from './maneuvers.js';
import { osrmInstruction, osrmIcon } from './osrm-text.js';

export async function getRoute(from, to, profileId, opts = {}) {
  const profile = PROFILES[profileId] || PROFILES.car;
  try {
    return await getValhallaRoute(from, to, profile, opts);
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    console.warn('Valhalla failed, falling back to OSRM:', err.message);
    return await getOsrmRoute(from, to, profile, opts);
  }
}

/* ----------------------------- Valhalla ----------------------------- */
async function getValhallaRoute(from, to, profile, { alternates = 2, signal } = {}) {
  const body = {
    locations: [
      { lon: from[0], lat: from[1], type: 'break' },
      { lon: to[0], lat: to[1], type: 'break' },
    ],
    costing: profile.costing,
    alternates,
    units: 'kilometers',
    language: 'de-DE',
    directions_options: { units: 'kilometers', language: 'de-DE' },
    costing_options: valhallaBias(profile.costing),
  };
  const res = await fetch(`${VALHALLA_URL}/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`Valhalla ${res.status}`);
  const data = await res.json();
  const routes = [parseValhallaTrip(data.trip, profile)];
  if (Array.isArray(data.alternates)) {
    for (const alt of data.alternates) {
      if (alt.trip) routes.push(parseValhallaTrip(alt.trip, profile));
    }
  }
  const filtered = routes.filter(Boolean);
  if (!filtered.length) throw new Error('Valhalla: keine Route');
  return filtered;
}

function valhallaBias(costing) {
  if (costing === 'bicycle') return { bicycle: { use_roads: 0.4, use_hills: 0.4 } };
  if (costing === 'pedestrian') return { pedestrian: { walking_speed: 5.1 } };
  return {};
}

function parseValhallaTrip(trip, profile) {
  if (!trip || !trip.legs || !trip.legs.length) return null;
  const coordinates = [];
  const maneuvers = [];

  for (const leg of trip.legs) {
    const shape = decodePolyline(leg.shape, 6);
    const prevLen = coordinates.length;
    const start = prevLen ? 1 : 0;
    const offset = prevLen - start;
    coordinates.push(...shape.slice(start));

    for (const m of leg.maneuvers || []) {
      const idx = Math.min(offset + m.begin_shape_index, coordinates.length - 1);
      maneuvers.push({
        icon: maneuverIcon(m.type),
        isArrival: isDestination(m.type),
        instruction: m.instruction,
        verbalPre: m.verbal_pre_transition_instruction || m.instruction,
        distance: (m.length || 0) * 1000,
        time: m.time || 0,
        coord: coordinates[idx],
        shapeIndex: idx,
        street: (m.street_names || [])[0] || '',
      });
    }
  }
  return finalizeRoute(coordinates, maneuvers, profile, {
    distance: (trip.summary.length || 0) * 1000,
    duration: trip.summary.time || 0,
  });
}

/* ------------------------------- OSRM ------------------------------- */
async function getOsrmRoute(from, to, profile, { signal } = {}) {
  const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`;
  const url =
    `${OSRM_URL}/${profile.osrm}/route/v1/driving/${coords}` +
    `?overview=full&geometries=polyline6&steps=true&alternatives=true&annotations=false`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(`OSRM: ${data.message || data.code || 'keine Route'}`);
  }
  return data.routes.map((r) => parseOsrmRoute(r, profile));
}

function parseOsrmRoute(route, profile) {
  const coordinates = decodePolyline(route.geometry, 6);
  const maneuvers = [];
  let cursor = 0;
  for (const leg of route.legs || []) {
    for (const step of leg.steps || []) {
      const stepCoords = decodePolyline(step.geometry, 6);
      // Align this step's start to the nearest vertex in the full geometry.
      const idx = nearestIndex(coordinates, stepCoords[0], cursor);
      cursor = idx;
      const m = step.maneuver || {};
      maneuvers.push({
        icon: osrmIcon(m.type, m.modifier),
        isArrival: m.type === 'arrive',
        instruction: osrmInstruction(m.type, m.modifier, step.name, m.exit),
        verbalPre: osrmInstruction(m.type, m.modifier, step.name, m.exit),
        distance: step.distance || 0,
        time: step.duration || 0,
        coord: coordinates[idx],
        shapeIndex: idx,
        street: step.name || '',
      });
    }
  }
  return finalizeRoute(coordinates, maneuvers, profile, {
    distance: route.distance || 0,
    duration: route.duration || 0,
  });
}

function nearestIndex(coords, pt, from = 0) {
  let best = from;
  let bestD = Infinity;
  for (let i = from; i < coords.length; i++) {
    const d = haversine(coords[i], pt);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
    if (bestD < 1) break;
  }
  return best;
}

/* ------------------------------ shared ------------------------------ */
function finalizeRoute(coordinates, maneuvers, profile, { distance, duration }) {
  return {
    coordinates,
    maneuvers,
    distance,
    duration,
    color: profile.color,
    profile: profile.id,
  };
}

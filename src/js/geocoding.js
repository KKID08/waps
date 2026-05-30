// Forward + reverse geocoding via Nominatim (OpenStreetMap).
import { NOMINATIM_URL } from './config.js';

const headers = { Accept: 'application/json' };

// Search for places matching `query`. Returns normalized results.
export async function searchPlaces(query, { center, limit = 6, signal } = {}) {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    limit: String(limit),
    'accept-language': 'de',
  });
  // Bias results toward the current map view when available.
  if (center) {
    const [lng, lat] = center;
    const d = 0.7;
    params.set('viewbox', `${lng - d},${lat + d},${lng + d},${lat - d}`);
    params.set('bounded', '0');
  }
  const res = await fetch(`${NOMINATIM_URL}/search?${params}`, { headers, signal });
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);
  const data = await res.json();
  return data.map(normalize);
}

// Reverse geocode a coordinate to a friendly label.
export async function reverseGeocode([lng, lat], { signal } = {}) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: 'jsonv2',
    'accept-language': 'de',
  });
  const res = await fetch(`${NOMINATIM_URL}/reverse?${params}`, { headers, signal });
  if (!res.ok) throw new Error(`Reverse geocoding failed (${res.status})`);
  const data = await res.json();
  return normalize(data);
}

function normalize(r) {
  const name = primaryName(r);
  const detail = secondaryName(r);
  return {
    id: r.osm_type ? `${r.osm_type}/${r.osm_id}` : `${r.lat},${r.lon}`,
    name,
    detail,
    label: detail ? `${name}, ${detail}` : name,
    coord: [parseFloat(r.lon), parseFloat(r.lat)],
    type: r.type,
    category: r.category || r.class,
  };
}

function primaryName(r) {
  const a = r.address || {};
  return (
    a.name ||
    r.name ||
    a.road ||
    a.pedestrian ||
    a.amenity ||
    a.shop ||
    a.tourism ||
    a.building ||
    a.suburb ||
    a.city ||
    a.town ||
    a.village ||
    (r.display_name ? r.display_name.split(',')[0] : 'Unbekannter Ort')
  );
}

function secondaryName(r) {
  const a = r.address || {};
  const parts = [];
  if (a.house_number && a.road) parts.push(`${a.road} ${a.house_number}`);
  else if (a.road) parts.push(a.road);
  const place = a.city || a.town || a.village || a.municipality || a.suburb;
  if (place) parts.push(place);
  if (a.country) parts.push(a.country);
  return parts.slice(0, 2).join(', ');
}

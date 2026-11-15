// Where water points come from. Server/CLI only.
//  1. openrouteservice "pois" (same API key, reliable, separate small daily quota): asks for
//     water within `bufferM` of each route line. One request per route, cached a week.
//  2. Fallback: the free Overpass API (volunteer servers, often busy).
// Both read OpenStreetMap data. Returns [{ lon, lat, kind, name, checkFirst }] or null.
import { cachedFetch, cacheDir } from './ors-cache.mjs';
import { fetchWaterPoints } from './overpass.mjs';

const POIS_URL = 'https://api.openrouteservice.org/pois';
// openrouteservice POI categories (from its "list" request).
const CATEGORY_KIND = { 166: 'drinking fountain', 565: 'drinking fountain', 182: 'water point', 338: 'spring' };

const poiFetch = cachedFetch(fetch, { dir: cacheDir('ors-pois'), maxAgeDays: 7 });

/** At most `max` points of a route, evenly spread, start and end kept. */
function thin(coords, max = 150) {
  const step = Math.max(1, Math.ceil(coords.length / max));
  const line = coords.filter((_, i) => i % step === 0).map(([lon, lat]) => [lon, lat]);
  const last = coords.at(-1);
  if (line.at(-1)[0] !== last[0] || line.at(-1)[1] !== last[1]) line.push([last[0], last[1]]);
  return line;
}

/** openrouteservice POI answer -> water points. */
export function parsePois(json) {
  return (json?.features ?? []).map((f) => {
    const id = Object.keys(f.properties?.category_ids ?? {})[0];
    const kind = CATEGORY_KIND[id] ?? 'water';
    return {
      lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], kind,
      name: f.properties?.osm_tags?.name ?? null,
      // Only fountains are meant for drinking; springs and water points: check first.
      checkFirst: kind !== 'drinking fountain',
    };
  });
}

export async function fetchWaterFromOrs(coordLists, { apiKey, fetchImpl = poiFetch, bufferM = 150, timeLimitMs = 12000 } = {}) {
  if (!apiKey) return null;
  const signal = AbortSignal.timeout(timeLimitMs);
  try {
    const answers = await Promise.all(coordLists.map(async (coords) => {
      const res = await fetchImpl(POIS_URL, {
        method: 'POST',
        headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request: 'pois',
          geometry: { geojson: { type: 'LineString', coordinates: thin(coords) }, buffer: bufferM },
          filters: { category_ids: Object.keys(CATEGORY_KIND).map(Number) },
        }),
        signal,
      });
      if (!res.ok) throw new Error(`ORS pois ${res.status}`);
      return parsePois(await res.json());
    }));
    // Same fountain near two routes: keep it once.
    const seen = new Set();
    return answers.flat().filter((p) => { const k = `${p.lon},${p.lat}`; return seen.has(k) ? false : seen.add(k); });
  } catch {
    return null;
  }
}

/** Water near these routes: openrouteservice first, Overpass if that fails. */
export async function findWater(coordLists, { apiKey, timeLimitMs = 12000 } = {}) {
  const t0 = Date.now();
  const fromOrs = await fetchWaterFromOrs(coordLists, { apiKey, timeLimitMs });
  if (fromOrs) return fromOrs;
  const left = timeLimitMs - (Date.now() - t0);
  return left > 1000 ? fetchWaterPoints(coordLists, { timeLimitMs: left }) : null;
}

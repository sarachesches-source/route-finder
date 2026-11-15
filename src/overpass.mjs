// Fetch water points from OpenStreetMap's Overpass API (free, no key), with a disk cache.
// Server/CLI only. Overpass servers are run by volunteers and are often busy, so:
// one request per search, cached a week, a fallback server, and a strict time limit.
import { cachedFetch } from './ors-cache.mjs';
import { boundsOf, waterQuery, parseWater } from './water.mjs';

// Public Overpass servers, tried in order (see wiki.openstreetmap.org/wiki/Overpass_API).
export const OVERPASS_SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
// Overpass asks apps to identify themselves. Generic name only - no personal details.
const USER_AGENT = 'RouteFinder/0.1 (trail running route planner, hobby project)';

const overpassFetch = cachedFetch(fetch, { dir: '.cache/overpass', maxAgeDays: 7 });

/**
 * Water points in the box around these routes, or null if no server answered in time.
 * `timeLimitMs` is the total budget across servers, so a busy server never stalls the app.
 */
export async function fetchWaterPoints(coordLists, {
  fetchImpl = overpassFetch, servers = OVERPASS_SERVERS, timeLimitMs = 12000,
} = {}) {
  const body = `data=${encodeURIComponent(waterQuery(boundsOf(coordLists)))}`;
  const deadline = Date.now() + timeLimitMs;
  for (const url of servers) {
    const left = deadline - Date.now();
    if (left < 500) break;
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
        body,
        signal: AbortSignal.timeout(left),
      });
      if (res.ok) return parseWater(await res.json());
    } catch { /* busy, slow or offline: try the next server */ }
  }
  return null; // water is a bonus: never fail the search because of it
}

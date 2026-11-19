// One complete search, as the web app shows it: find loops, summarize them, add water.
// Used by the /api/find endpoint and by scripts/make-examples.mjs. Server/CLI only.
import { findRoutes } from './engine.mjs';
import { summarizeRoute, attachWater } from './summary.mjs';
import { fakeOrsFetch, fakeWaterPoints } from './fake-ors.mjs';
import { findWater } from './water-sources.mjs';
import { cachedFetch } from './ors-cache.mjs';
import { loopDirection } from './rehearsal.mjs';

/**
 * @param params  { lat, lon, km, vert, shape?, pattern? }  (already checked)
 * @param options { practice, apiKey, fetchImpl? }
 * @returns { routes, tried, failed, requests: { hits, misses } | null }
 *   `fetchImpl.stats` is also readable by the caller to count requests if this throws.
 */
export async function runSearch({ lat, lon, km, vert, shape, pattern }, { practice = false, apiKey, fetchImpl } = {}) {
  const fetcher = fetchImpl ?? (practice ? fakeOrsFetch : cachedFetch(fetch));
  const result = await findRoutes(
    { lat, lon, distanceM: km * 1000, gainM: vert, shape: shape || undefined, pattern: pattern ?? undefined },
    practice ? { apiKey, fetchImpl: fetcher, sleep: async () => {} } : { apiKey, fetchImpl: fetcher },
  );
  const routes = result.routes.map((r, i) => summarizeRoute(r.coords, {
    name: `Result ${i + 1}`, file: `route-${i + 1}.gpx`,
    distanceM: r.distanceM, kind: r.kind, heading: r.heading, seed: r.seed,
    score: r.score, accuracy: r.accuracy, extra: r.extra, closeEnough: r.closeEnough,
    shapePenalty: r.shapePenalty, patternParts: r.patternParts,
    patternPenalty: r.patternPenalty, direction: loopDirection(r.coords), surface: r.surface ?? null,
  }));
  // Water stops along the results (OpenStreetMap via openrouteservice, cached; made up in practice mode).
  const coordLists = routes.map((r) => r.coords);
  attachWater(routes, practice ? fakeWaterPoints(coordLists) : await findWater(coordLists, { apiKey }));
  return {
    routes, tried: result.tried, failed: result.failed, requests: fetcher.stats ?? null,
    quotaHit: result.quotaHit, remaining: result.remaining,
  };
}

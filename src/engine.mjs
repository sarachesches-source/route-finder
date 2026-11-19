// Route engine: asks openrouteservice for many candidate loops, then ranks
// them by how closely they hit the distance and climbing targets.

import { findClimbs, shapePenalty } from './climbs.mjs';
import { bestDirection } from './rehearsal.mjs';
import { summarizeSurface } from './surface.mjs';

const ORS_URL ='https://api.openrouteservice.org/v2/directions/foot-hiking/geojson';

/** Climbing in metres, ignoring bumps smaller than `threshold` (elevation data noise). */
export function elevationGain(coords, threshold = 3) {
  let gain = 0;
  let ref = coords[0]?.[2];
  if (ref == null) return 0;
  for (const c of coords) {
    const diff = c[2] - ref;
    if (diff >= threshold) { gain += diff; ref = c[2]; }
    else if (diff <= -threshold) { ref = c[2]; }
  }
  return Math.round(gain);
}

/**
 * Remove elevation spikes: a point more than `maxJump` metres away from the middle value of
 * its neighbours (2 each side) gets that middle value. Real slopes change smoothly, so they
 * pass through untouched; one- or two-point blips in the elevation data (bridges, data
 * errors) don't count as climbs any more.
 */
export function cleanElevation(coords, maxJump = 8) {
  if (coords.length < 5 || coords[0][2] == null) return coords;
  return coords.map((c, i) => {
    const win = coords.slice(Math.max(0, i - 2), i + 3).map((p) => p[2]).sort((a, b) => a - b);
    const median = win[Math.floor(win.length / 2)];
    return Math.abs(c[2] - median) > maxJump ? [c[0], c[1], median] : c;
  });
}

function haversine(a, b) {
  const R = 6371000, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function routeLength(coords) {
  let d = 0;
  for (let i = 1; i < coords.length; i++) d += haversine(coords[i - 1], coords[i]);
  return d;
}

/** 0 = perfect. Each 1% miss on distance or climbing adds `weight` points. */
export function score(route, target, weights = { distance: 1, gain: 1 }) {
  const dErr = Math.abs(route.distanceM - target.distanceM) / target.distanceM;
  const gErr = Math.abs(route.gainM - target.gainM) / Math.max(target.gainM, 50);
  return 100 * (weights.distance * dErr + weights.gain * gErr);
}

/** Point `distM` metres from (lon, lat) along compass bearing `bearingDeg` (0 = north, 90 = east). */
export function offsetPoint(lon, lat, bearingDeg, distM) {
  const R = 6371000, b = (bearingDeg * Math.PI) / 180;
  const dLat = (distM * Math.cos(b)) / R;
  const dLon = (distM * Math.sin(b)) / (R * Math.cos((lat * Math.PI) / 180));
  return [lon + (dLon * 180) / Math.PI, lat + (dLat * 180) / Math.PI];
}

// Paths wind, so they are longer than straight lines. First guess only; each loop is corrected.
const WINDING = 1.3;

/** Request body for one loop of roughly `lengthM` metres. */
function loopBody(job, lengthM) {
  // extra_info: surface and way type for every stretch, for the trail % breakdown.
  const base = { elevation: true, instructions: false, extra_info: ['surface', 'waytype'] };
  if (job.kind === 'random') {
    return { ...base, coordinates: [[job.lon, job.lat]],
      options: { round_trip: { length: Math.round(lengthM), points: job.points, seed: job.seed } } };
  }
  // Heading loop: a triangle start -> A -> B -> start, pointing along job.heading.
  const half = job.spread / 2;
  const r = lengthM / (WINDING * (2 + 2 * Math.sin((half * Math.PI) / 180)));
  const a = offsetPoint(job.lon, job.lat, job.heading - half, r);
  const b = offsetPoint(job.lon, job.lat, job.heading + half, r);
  return { ...base, coordinates: [[job.lon, job.lat], a, b, [job.lon, job.lat]], radiuses: [350, 1000, 1000, 350] };
}

const sleepReal = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchLoop(job, lengthM, { apiKey, fetchImpl, sleep }) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(ORS_URL, {
      method: 'POST',
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(loopBody(job, lengthM)),
    });
    // The free plan allows about 40 requests a minute: wait and retry instead of failing.
    if (res.status === 429 && attempt < 4) { await sleep(15000 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`ORS ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const feature = (await res.json()).features?.[0];
    if (!feature) throw new Error('ORS returned no route');
    const coords = cleanElevation(feature.geometry.coordinates);
    return {
      kind: job.kind, heading: job.heading, spread: job.spread, seed: job.seed, points: job.points,
      requestedM: Math.round(lengthM), coords,
      distanceM: feature.properties?.summary?.distance ?? routeLength(coords),
      gainM: elevationGain(coords),
      surface: summarizeSurface(coords, feature.properties?.extras),
    };
  }
}

/**
 * Fetch a loop; if it comes back too long or too short, ask again with a scaled length.
 * Keeps whichever attempt landed closest to the target distance.
 */
async function fetchCorrected(job, target, ctx, corrections = ctx.corrections) {
  let lengthM = target.distanceM * (job.lengthFactor ?? 1);
  let best = null;
  for (let i = 0; i <= corrections; i++) {
    if (i > 0 && ctx.stopped?.()) break; // request cap or quota reached: keep the best so far
    const r = await fetchLoop(job, lengthM, ctx);
    r.distErr = Math.abs(r.distanceM - target.distanceM) / target.distanceM;
    if (!best || r.distErr < best.distErr) best = r;
    if (r.distErr <= ctx.distanceTolerance) break;
    lengthM *= target.distanceM / r.distanceM;
  }
  return best;
}

/**
 * Find the best loops for a start point, distance and climbing target.
 *
 * "focused" strategy (default, ~25-30 requests):
 *   1. scout: one uncorrected triangle loop per compass direction and shape (1 request each)
 *   2. focus: the `focus` scouts whose climbing per km best matches the target get full
 *      distance correction, plus `candidates` random round trips
 * "wide" strategy (the original, ~55 requests): every direction and shape, fully corrected.
 * Both stop at once if openrouteservice says the daily quota is used up, and never send more
 * than `maxRequests` requests.
 *
 * @param {{lat:number, lon:number, distanceM:number, gainM:number, shape?:'long'|'rolling'|'repeats', pattern?:number[]}} target
 *   pattern: a race pattern to copy, { climb, descent?, grades? } (see rehearsal.mjs); an array
 *   is taken as the climbing curve alone
 * @returns { routes, all, tried, failed, errors, requests, quotaHit }
 */
export async function findRoutes(target, {
  apiKey, strategy = 'focused', headings = 8, spreads = [25, 60], focus = 4, candidates, corrections = 2,
  maxRequests = 45, distanceTolerance = 0.05, shapeWeight = 0.5, patternWeight = 0.7, accuracySlack = 10,
  trailWeight = 0.15, keep = 3, concurrency = 4, fetchImpl = fetch, sleep = sleepReal, onProgress,
} = {}) {
  if (!apiKey) throw new Error('Missing openrouteservice API key');
  const { lat, lon } = target;
  candidates ??= strategy === 'wide' ? 8 : 3;

  // Count requests, and never ask the same question twice in one search.
  const memo = new Map();
  const ctx = {
    apiKey, sleep, corrections, distanceTolerance, requests: 0, quotaHit: false,
    fetchImpl: async (url, init) => {
      const key = init.body;
      if (memo.has(key)) return memo.get(key)();
      ctx.requests++;
      const res = await fetchImpl(url, init);
      // Some API gateways report the quota left; keep the lowest value seen, if any.
      const left = Number(res.headers?.get?.('x-ratelimit-remaining'));
      if (Number.isFinite(left)) ctx.remaining = Math.min(ctx.remaining ?? Infinity, left);
      if (!res.ok) return res;
      const data = await res.json();
      const replay = () => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
      memo.set(key, replay);
      return replay();
    },
  };
  const stopped = () => ctx.quotaHit || ctx.requests >= maxRequests;
  ctx.stopped = stopped;

  const routes = [], errors = [];
  let done = 0, total = 0;
  async function run(jobs, corrections) {
    total += jobs.length;
    const out = [];
    let next = 0;
    async function worker() {
      while (next < jobs.length && !stopped()) {
        const job = jobs[next++];
        try { out.push(await fetchCorrected(job, target, ctx, corrections)); }
        catch (e) {
          errors.push(e.message);
          if (/ORS 403/.test(e.message)) ctx.quotaHit = true; // daily quota used up: stop now
        }
        onProgress?.(++done, total);
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    return out;
  }
  const headingJob = (heading, spread) => ({ kind: 'heading', lat, lon, heading, spread });
  const lengthFactors = [0.85, 1.0, 1.15];
  const pointOptions = [3, 4, 6, 8];
  const randomJobs = (n) => Array.from({ length: n }, (_, i) =>
    ({ kind: 'random', lat, lon, lengthFactor: lengthFactors[i % 3], points: pointOptions[i % 4], seed: i + 1 }));
  const directions = Array.from({ length: headings }, (_, h) => (360 / headings) * h);

  if (strategy === 'wide') {
    const jobs = directions.flatMap((h) => spreads.map((sp) => headingJob(h, sp)));
    routes.push(...await run([...jobs, ...randomJobs(candidates)]));
  } else {
    // 1. Scout every direction and shape once, uncorrected (1 request each).
    const scouts = await run(directions.flatMap((h) => spreads.map((sp) => headingJob(h, sp))), 0);
    // Scouts are information; only ones already close on distance may be shown as results.
    routes.push(...scouts.filter((r) => r.distErr <= 0.1));
    // 2. Correct only the scouts whose climbing per km is closest to the target's. Their first
    //    request is already known (memo), so each costs about one more request.
    const predicted = (r) => (r.gainM * target.distanceM) / r.distanceM;
    const ranked = [...scouts]
      .sort((a, b) => Math.abs(predicted(a) - target.gainM) - Math.abs(predicted(b) - target.gainM));
    // Plus the other loop shape of the two best directions: one shape often scouts poorly
    // while the other one in the same direction is the winner.
    const picks = [...ranked.slice(0, focus), ...ranked.slice(0, 2).flatMap((r) => spreads.map((sp) => ({ heading: r.heading, spread: sp })))];
    const seen = new Set();
    const focused = picks.filter((p) => { const k = `${p.heading}/${p.spread}`; return seen.has(k) ? false : seen.add(k); })
      .map((p) => headingJob(p.heading, p.spread));
    routes.push(...await run([...focused, ...randomJobs(candidates)]));
    // Stopped early (cap or quota) with nothing close: rough scouts beat no answer at all.
    if (!routes.length) routes.push(...scouts);
  }
  if (!routes.length) throw new Error(`No routes found. First error: ${errors[0]}`);

  for (const r of routes) {
    r.accuracy = score(r, target); // distance + climbing miss only
    r.extra = 0;                   // shape / race-pattern miss, used as a tie-breaker
    // Optional climb shape ('long' | 'rolling' | 'repeats').
    if (target.shape) {
      r.climbs = findClimbs(r.coords);
      r.shapePenalty = shapePenalty(r.climbs, target.shape, { routeGainM: r.gainM });
      r.extra += shapeWeight * r.shapePenalty;
    }
    // Optional race pattern (climbing curve of an uploaded race): try the loop both ways round.
    if (target.pattern) {
      const { penalty, parts, reversed } = bestDirection(r.coords, target.pattern);
      r.patternParts = parts;
      if (reversed) {
        const last = r.coords.length - 1;
        r.coords = [...r.coords].reverse();
        r.reversed = true;
        if (r.surface) r.surface.sections = r.surface.sections.map(([a, b, g]) => [last - b, last - a, g]).reverse();
      }
      r.patternPenalty = penalty;
      r.extra += patternWeight * penalty;
    }
    // Trail runners: among routes that are close enough, prefer more trail (0..15 points).
    if (r.surface && trailWeight) r.extra += trailWeight * (100 - r.surface.trail);
    r.score = r.accuracy + r.extra;
  }
  const ranked = rankRoutes(routes, { keep, slack: accuracySlack });
  return {
    routes: ranked, all: routes, tried: routes.length, failed: errors.length, errors: errors.slice(0, 3),
    requests: ctx.requests, quotaHit: ctx.quotaHit, remaining: ctx.remaining ?? null,
  };
}

/**
 * Pick the `keep` best, different routes.
 * Hitting distance and climbing comes first: only routes within `slack` points of the most
 * accurate one are "close enough", and among those shape / race pattern decides. So a
 * preference can never cost more than about `slack`% of accuracy.
 */
export function rankRoutes(routes, { keep = 3, slack = 10 } = {}) {
  const best = Math.min(...routes.map((r) => r.accuracy));
  for (const r of routes) r.closeEnough = r.accuracy <= best + slack;
  const sorted = [...routes].sort((a, b) =>
    (a.closeEnough === b.closeEnough ? 0 : a.closeEnough ? -1 : 1) ||
    (a.closeEnough ? a.accuracy + a.extra - (b.accuracy + b.extra) : a.accuracy - b.accuracy));
  // Drop near-duplicates so the results are really different routes.
  const picked = [];
  for (const r of sorted) {
    const dup = picked.some((p) =>
      Math.abs(p.distanceM - r.distanceM) < 150 && Math.abs(p.gainM - r.gainM) < 15);
    if (!dup) picked.push(r);
    if (picked.length === keep) break;
  }
  return picked;
}

export function toGpx(route, name = 'Route') {
  const pts = route.coords
    .map(([lon, lat, ele]) => `      <trkpt lat="${lat}" lon="${lon}"><ele>${ele ?? 0}</ele></trkpt>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Hillgorithm" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${name}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`;
}

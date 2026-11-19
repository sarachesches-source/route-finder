// POST /api/find  { lat, lon, km, vert, shape?, race?: { curve, name }, practice? }
// Runs the route search on the server, so the openrouteservice key never reaches the browser.
import { SHAPES } from '../../../src/climbs.mjs';
import { fakeOrsFetch } from '../../../src/fake-ors.mjs';
import { runSearch } from '../../../src/search.mjs';
import { cachedFetch } from '../../../src/ors-cache.mjs';
import { isValidCurve, isValidMix } from '../../../src/rehearsal.mjs';
import { serverLimiter, visitorKey } from '../../../src/limits.mjs';

const IS_DEV = process.env.NODE_ENV !== 'production';
const FALLBACK = IS_DEV ? 'switch on practice mode' : 'try one of the example searches';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // a search with rate-limit waits can take a couple of minutes

const fail = (status, error) => Response.json({ error }, { status });

/** Turn routing-service errors into something a runner can act on. */
function friendly(message) {
  if (/quota exceeded/i.test(message) || /ORS 403/.test(message)) {
    return `Today's free route searches are used up for everyone. Try again later, or ${FALLBACK}.`;
  }
  if (/ORS 401/.test(message)) return 'openrouteservice rejected the API key. Check the ORS_API_KEY setting.';
  if (/ORS 404|ORS 2010|could not find routable point/i.test(message)) {
    return 'No paths found near that start point. Try moving it onto a road or trail.';
  }
  return `Search failed: ${message.slice(0, 200)}`;
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return fail(400, 'Invalid request.'); }

  const lat = Number(body.lat), lon = Number(body.lon), km = Number(body.km), vert = Number(body.vert);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return fail(400, 'Latitude must be between -90 and 90.');
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return fail(400, 'Longitude must be between -180 and 180.');
  if (!Number.isFinite(km) || km < 2 || km > 100) return fail(400, 'Distance must be between 2 and 100 km.');
  if (!Number.isFinite(vert) || vert < 0 || vert > 5000) return fail(400, 'Climbing must be between 0 and 5000 m.');
  const shape = body.shape || undefined;
  if (shape && !SHAPES.includes(shape)) return fail(400, `Shape must be one of: ${SHAPES.join(', ')}.`);
  let pattern;
  if (body.race != null) {
    const { curve, descent, grades } = body.race;
    if (!isValidCurve(curve) || (descent != null && !isValidCurve(descent)) || (grades != null && !isValidMix(grades))) {
      return fail(400, 'The race pattern could not be read. Try uploading the race again.');
    }
    pattern = { climb: curve, descent: descent ?? undefined, grades: grades ?? undefined };
  }

  // Practice mode only exists while developing, never on a deployed site.
  const practice = body.practice === true && IS_DEV;
  const apiKey = practice ? 'practice' : process.env.ORS_API_KEY;
  if (!apiKey) return fail(500, 'No openrouteservice key: set ORS_API_KEY.');

  // Public site: per-visitor and daily limits on real searches (see src/limits.mjs).
  const limiter = practice ? null : serverLimiter();
  const visitor = limiter ? visitorKey(request.headers) : null;
  if (limiter) {
    const verdict = limiter.check(visitor);
    if (!verdict.ok) {
      return fail(429, verdict.reason === 'visitor'
        ? `You've reached the search limit for now. Try again in ${verdict.retryInMin} min, or ${FALLBACK}.`
        : `Today's free route searches are used up for everyone. Try again later, or ${FALLBACK}.`);
    }
    limiter.record(visitor);
  }

  // Real searches go through the disk cache, so repeating one costs no quota.
  const fetchImpl = practice ? fakeOrsFetch : cachedFetch(fetch);
  try {
    const result = await runSearch({ lat, lon, km, vert, shape, pattern }, { practice, apiKey, fetchImpl });
    if (result.quotaHit) limiter?.markQuotaOut();
    limiter?.noteRemaining(result.remaining);
    return Response.json({ ...result, practice });
  } catch (e) {
    if (/ORS 403|quota exceeded/i.test(e.message)) limiter?.markQuotaOut();
    return fail(502, friendly(e.message));
  } finally {
    if (limiter && fetchImpl.stats) limiter.spend(fetchImpl.stats.misses); // only real requests count
  }
}

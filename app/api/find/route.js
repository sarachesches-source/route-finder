// POST /api/find  { lat, lon, km, vert, shape?, practice? }
// Runs the route search on the server, so the openrouteservice key never reaches the browser.
import { findRoutes } from '../../../src/engine.mjs';
import { SHAPES } from '../../../src/climbs.mjs';
import { summarizeRoute } from '../../../src/summary.mjs';
import { fakeOrsFetch } from '../../../src/fake-ors.mjs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // a search with rate-limit waits can take a couple of minutes

const fail = (status, error) => Response.json({ error }, { status });

/** Turn routing-service errors into something a runner can act on. */
function friendly(message) {
  if (/quota exceeded/i.test(message) || /ORS 403/.test(message)) {
    return 'Daily openrouteservice limit reached. Try again tomorrow, or switch on practice mode.';
  }
  if (/ORS 401/.test(message)) return 'openrouteservice rejected the API key. Check ORS_API_KEY in .env.';
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

  // Practice mode only exists while developing, never on a deployed site.
  const practice = body.practice === true && process.env.NODE_ENV !== 'production';
  const apiKey = practice ? 'practice' : process.env.ORS_API_KEY;
  if (!apiKey) return fail(500, 'No openrouteservice key: add ORS_API_KEY to .env.');

  try {
    const result = await findRoutes(
      { lat, lon, distanceM: km * 1000, gainM: vert, shape },
      practice ? { apiKey, fetchImpl: fakeOrsFetch, sleep: async () => {} } : { apiKey },
    );
    const routes = result.routes.map((r, i) => summarizeRoute(r.coords, {
      name: `Result ${i + 1}`, file: `route-${i + 1}.gpx`,
      distanceM: r.distanceM, kind: r.kind, heading: r.heading, seed: r.seed,
      score: r.score, shapePenalty: r.shapePenalty,
    }));
    return Response.json({ routes, tried: result.tried, failed: result.failed, practice });
  } catch (e) {
    return fail(502, friendly(e.message));
  }
}

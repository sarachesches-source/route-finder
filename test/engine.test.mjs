import test from 'node:test';
import assert from 'node:assert/strict';
import { elevationGain, score, findRoutes, toGpx, routeLength, offsetPoint } from '../src/engine.mjs';

test('elevationGain ignores small noise', () => {
  const flatNoisy = [0, 1, 0, 2, 1, 0].map((e, i) => [23 + i * 0.001, 46, 400 + e]);
  assert.equal(elevationGain(flatNoisy), 0);
  const climb = [400, 420, 450, 440, 480].map((e, i) => [23 + i * 0.001, 46, e]);
  assert.equal(elevationGain(climb), 90);
});

test('score is 0 on target and grows with error', () => {
  const t = { distanceM: 10000, gainM: 400 };
  assert.equal(score({ distanceM: 10000, gainM: 400 }, t), 0);
  assert.ok(score({ distanceM: 11000, gainM: 400 }, t) < score({ distanceM: 13000, gainM: 400 }, t));
});

// Fake routing service.
//  - random loops: each seed yields a different climb, length overshoots by (0.9 + seed/100)
//  - heading loops: come back 50% longer than the straight-line triangle; only the
//    loop pointing south (the "hills") climbs 400 m, every other direction is flat-ish.
function loopResponse(coordsIn, distance, climb) {
  const n = 200, coords = [];
  for (let i = 0; i <= n; i++) {
    const up = i <= n / 2 ? i / (n / 2) : (n - i) / (n / 2);
    coords.push([23.6 + i * 1e-4, 46.77, 400 + climb * up]);
  }
  return { ok: true, status: 200, json: async () => ({ features: [{ geometry: { coordinates: coords }, properties: { summary: { distance } } }] }) };
}
function fakeFetch(_url, init) {
  const body = JSON.parse(init.body);
  if (body.options?.round_trip) {
    const { length, seed } = body.options.round_trip;
    if (seed === 5) return Promise.resolve({ ok: false, status: 500, text: async () => 'boom' });
    return Promise.resolve(loopResponse(null, length * (0.9 + seed * 0.01), seed * 40));
  }
  const pts = body.coordinates;
  const midLat = (pts[1][1] + pts[2][1]) / 2;
  const south = midLat < pts[0][1] - 0.01 && Math.abs((pts[1][0] + pts[2][0]) / 2 - pts[0][0]) < 0.01;
  return Promise.resolve(loopResponse(null, routeLength(pts) * 1.5, south ? 400 : 150));
}

test('offsetPoint moves the right way', () => {
  const [lon, lat] = offsetPoint(23.6, 46.77, 0, 1000);
  assert.ok(lat > 46.77 && Math.abs(lon - 23.6) < 1e-9);
  assert.ok(Math.abs(routeLength([[23.6, 46.77], offsetPoint(23.6, 46.77, 90, 1000)]) - 1000) < 5);
});

test('findRoutes finds the hilly heading, corrects distance, survives failures', async () => {
  const target = { lat: 46.77, lon: 23.6, distanceM: 10000, gainM: 400 };
  const r = await findRoutes(target, { apiKey: 'x', fetchImpl: fakeFetch });
  assert.equal(r.routes.length, 3);
  assert.equal(r.failed, 1);
  assert.ok(r.routes[0].score <= r.routes[1].score && r.routes[1].score <= r.routes[2].score);
  assert.equal(r.routes[0].kind, 'heading');
  assert.equal(r.routes[0].heading, 180);
  assert.equal(r.routes[0].gainM, 400);
  assert.ok(Math.abs(r.routes[0].distanceM - 10000) <= 500, `best distance ${r.routes[0].distanceM}`);
  assert.match(toGpx(r.routes[0]), /<trkpt lat="46.77"/);
  assert.ok(routeLength(r.routes[0].coords) > 0);
});

test('findRoutes waits and retries when rate-limited', async () => {
  let calls = 0, waits = 0;
  const limited = (url, init) => (++calls === 1
    ? Promise.resolve({ ok: false, status: 429, text: async () => 'slow down' })
    : fakeFetch(url, init));
  const target = { lat: 46.77, lon: 23.6, distanceM: 10000, gainM: 400 };
  const r = await findRoutes(target, { apiKey: 'x', fetchImpl: limited, sleep: async () => { waits++; }, concurrency: 1 });
  assert.equal(waits, 1);
  assert.equal(r.failed, 1); // only the seed-5 failure, not the rate limit
});

test('findRoutes adds a climb-shape penalty when a shape is asked for', async () => {
  // Every fake loop is a single up-then-down hill: a perfect "long" climb, a poor "rolling" one.
  const base = { lat: 46.77, lon: 23.6, distanceM: 10000, gainM: 400 };
  const long = await findRoutes({ ...base, shape: 'long' }, { apiKey: 'x', fetchImpl: fakeFetch });
  const rolling = await findRoutes({ ...base, shape: 'rolling' }, { apiKey: 'x', fetchImpl: fakeFetch });
  const plain = await findRoutes(base, { apiKey: 'x', fetchImpl: fakeFetch });
  assert.equal(long.routes[0].shapePenalty, 0);
  assert.ok(rolling.routes[0].shapePenalty >= 50);
  assert.equal(plain.routes[0].shapePenalty, undefined);
  assert.ok(rolling.routes[0].score > long.routes[0].score);
});

test('practice mode: fake service gives 3 routes near the target distance', async () => {
  const { fakeOrsFetch } = await import('../src/fake-ors.mjs');
  const r = await findRoutes({ lat: 46.7712, lon: 23.6236, distanceM: 15000, gainM: 500 },
    { apiKey: 'practice', fetchImpl: fakeOrsFetch, sleep: async () => {} });
  assert.equal(r.routes.length, 3);
  assert.equal(r.failed, 0);
  for (const x of r.routes) assert.ok(Math.abs(x.distanceM - 15000) <= 750, `distance ${x.distanceM}`);
});

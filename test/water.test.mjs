import test from 'node:test';
import assert from 'node:assert/strict';
import { bailoutInfo } from '../src/bailout.mjs';
import { boundsOf, waterQuery, parseWater, waterAlongRoute } from '../src/water.mjs';
import { fetchWaterPoints } from '../src/overpass.mjs';
import { offsetPoint, routeLength } from '../src/engine.mjs';

function withAlong(coords) {
  const along = [0];
  for (let i = 1; i < coords.length; i++) along.push(along[i - 1] + routeLength([coords[i - 1], coords[i]]));
  return along;
}
// Walk from (23.6, 46.77): a list of [bearing, metres] legs, a point every 50 m.
function walk(legs) {
  let p = [23.6, 46.77];
  const coords = [[...p, 400]];
  for (const [bearing, m] of legs) for (let d = 50; d <= m; d += 50) { p = offsetPoint(p[0], p[1], bearing, 50); coords.push([...p, 400]); }
  return coords;
}

test('bail-out: farthest point and checkpoints on an out-and-back', () => {
  const coords = walk([[90, 5000], [270, 5000]]); // 5 km east and back
  const info = bailoutInfo(coords, withAlong(coords));
  assert.ok(Math.abs(info.farthest.km - 5) < 0.1);
  assert.ok(Math.abs(info.farthest.backM - 5000) < 30);
  assert.equal(info.checkpoints.length, 9); // every 1 km on a 10 km run
  assert.ok(Math.abs(info.checkpoints[2].backM - 3000) < 30);
  assert.deepEqual(info.shortcuts, []);
});

test('bail-out: a figure-eight passing the start mid-run is a shortcut spot', () => {
  // 3 km loop north, back through the start area, then 3 km loop south.
  const coords = walk([[0, 1000], [90, 1000], [180, 1000], [270, 950], [180, 1000], [90, 1000], [0, 1000], [270, 1000]]);
  const info = bailoutInfo(coords, withAlong(coords));
  assert.equal(info.shortcuts.length, 1);
  assert.ok(info.shortcuts[0].backM < 100, `shortcut ${info.shortcuts[0].backM} m from start`);
  assert.ok(info.shortcuts[0].km > 3 && info.shortcuts[0].km < 5);
});

test('water: query, parsing and stops along the route', () => {
  const coords = walk([[90, 6000]]);
  const along = withAlong(coords);
  const box = boundsOf([coords]);
  assert.ok(box.s < 46.77 && box.n > 46.77 && box.w < 23.6);
  assert.match(waterQuery(box), /amenity"="drinking_water"/);

  const at = (m, off) => offsetPoint(...offsetPoint(23.6, 46.77, 90, m), 0, off);
  const json = { elements: [
    { lon: at(1000, 30)[0], lat: at(1000, 30)[1], tags: { amenity: 'drinking_water' } },
    { lon: at(4000, 60)[0], lat: at(4000, 60)[1], tags: { natural: 'spring', name: 'Izvor' } },
    { lon: at(2500, 20)[0], lat: at(2500, 20)[1], tags: { natural: 'spring', drinking_water: 'no' } }, // skipped
    { lon: at(5000, 900)[0], lat: at(5000, 900)[1], tags: { amenity: 'drinking_water' } },           // too far off
  ] };
  const points = parseWater(json);
  assert.equal(points.length, 3);
  const { stops, longestDryKm } = waterAlongRoute(coords, along, points);
  assert.deepEqual(stops.map((s) => [s.km, s.kind, s.checkFirst]), [[1, 'drinking fountain', false], [4, 'spring', true]]);
  assert.ok(Math.abs(stops[1].offM - 60) < 5);
  assert.equal(longestDryKm, 3); // km 1 -> 4 (and 4 -> 6 finish is 2)
});

test('water fetch failure gives null instead of breaking the search', async () => {
  const broken = async () => { throw new Error('offline'); };
  assert.equal(await fetchWaterPoints([walk([[90, 1000]])], { fetchImpl: broken }), null);
  const busy = async () => ({ ok: false, status: 429, text: async () => 'too many' });
  assert.equal(await fetchWaterPoints([walk([[90, 1000]])], { fetchImpl: busy }), null);
});

test('water fetch tries the next server, and respects the time limit', async () => {
  const route = [walk([[90, 1000]])];
  const calls = [];
  const flaky = async (url) => {
    calls.push(url);
    if (url === 'a') return { ok: false, status: 429, text: async () => 'busy' };
    return { ok: true, status: 200, json: async () => ({ elements: [{ lon: 23.605, lat: 46.77, tags: { amenity: 'drinking_water' } }] }) };
  };
  const points = await fetchWaterPoints(route, { fetchImpl: flaky, servers: ['a', 'b'] });
  assert.deepEqual(calls, ['a', 'b']);
  assert.equal(points.length, 1);

  const hang = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const t0 = Date.now();
  assert.equal(await fetchWaterPoints(route, { fetchImpl: hang, servers: ['a', 'b'], timeLimitMs: 800 }), null);
  assert.ok(Date.now() - t0 < 2000, 'gave up within the time limit');
});

test('openrouteservice water: parsing, one request per route, failure gives null', async () => {
  const { parsePois, fetchWaterFromOrs } = await import('../src/water-sources.mjs');
  const answer = { features: [
    { geometry: { coordinates: [23.55, 46.73] }, properties: { category_ids: { 338: {} }, osm_tags: { name: 'Izvor' } } },
    { geometry: { coordinates: [23.56, 46.74] }, properties: { category_ids: { 166: {} } } },
  ] };
  assert.deepEqual(parsePois(answer).map((p) => [p.kind, p.name, p.checkFirst]),
    [['spring', 'Izvor', true], ['drinking fountain', null, false]]);

  const bodies = [];
  const ok = async (url, init) => { bodies.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => answer }; };
  const routes = [walk([[90, 3000]]), walk([[0, 3000]])];
  const points = await fetchWaterFromOrs(routes, { apiKey: 'k', fetchImpl: ok });
  assert.equal(bodies.length, 2);
  assert.ok(bodies[0].geometry.geojson.coordinates.length <= 151);
  assert.equal(bodies[0].geometry.buffer, 150);
  assert.equal(points.length, 2, 'same points near both routes counted once');

  const quota = async () => ({ ok: false, status: 403, text: async () => 'Quota exceeded' });
  assert.equal(await fetchWaterFromOrs(routes, { apiKey: 'k', fetchImpl: quota }), null);
  assert.equal(await fetchWaterFromOrs(routes, {}), null); // no key
});

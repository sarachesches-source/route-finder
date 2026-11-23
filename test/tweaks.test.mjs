import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRoute, reverseRoute } from '../src/summary.mjs';
import { routeBearing } from '../src/bailout.mjs';
import { offsetPoint, findRoutes } from '../src/engine.mjs';
import { fakeOrsFetch } from '../src/fake-ors.mjs';

// A square loop: 2 km north, 2 km east, back south, back west; a climb on the first side.
function squareLoop() {
  let p = [23.6, 46.77]; let ele = 400;
  const coords = [[...p, ele]];
  for (const [bearing, climb] of [[0, 0.1], [90, 0], [180, -0.1], [270, 0]]) {
    for (let d = 50; d <= 2000; d += 50) { p = offsetPoint(p[0], p[1], bearing, 50); ele += climb * 50; coords.push([...p, ele]); }
  }
  return coords;
}

test('routeBearing points from the start towards the far corner', () => {
  const b = routeBearing(squareLoop());
  assert.ok(Math.abs(b - 45) <= 2, `bearing ${b}`); // far corner is north-east
});

test('reverseRoute flips the loop: same distance and climbing, climbs and water move', () => {
  const coords = squareLoop();
  const r = summarizeRoute(coords, {
    name: 'Result 1', distanceM: 8000, accuracy: 2, direction: 'clockwise',
    surface: { trail: 60, gravel: 0, paved: 40, unknown: 0, road: 10, sections: [[0, 40, 'trail'], [40, 160, 'paved']] },
  });
  const [lon, lat] = offsetPoint(coords[0][0], coords[0][1], 0, 500); // 500 m up the first side
  r.water = { stops: [{ lon, lat, kind: 'spring', name: null, checkFirst: true, km: 0.5, offM: 0 }], longestDryKm: 7.5 };
  const rev = reverseRoute(r);
  assert.equal(rev.name, 'Result 1 (reversed)');
  assert.equal(rev.distanceM, 8000);
  assert.equal(rev.gainM, r.gainM, 'searched climbing kept');
  assert.equal(rev.accuracy, 2);
  assert.notEqual(rev.direction, 'clockwise');
  // Backwards, the climb is the second side (km 2-4) instead of the first (km 0-2).
  assert.ok(rev.climbs[0].endM > r.climbs[0].endM + 1500, `climb top moved from ${r.climbs[0].endM} to ${rev.climbs[0].endM}`);
  assert.ok(Math.abs(rev.water.stops[0].km - 7.5) < 0.1, `water now at km ${rev.water.stops[0].km}`);
  assert.deepEqual(rev.surface.sections[0], [0, 120, 'paved']);
  assert.equal(reverseRoute(rev).name, 'Result 1', 'flipping twice restores the name');
});

test('searching around one direction is cheaper and stays near that bearing', async () => {
  const target = { lat: 46.77, lon: 23.6, distanceM: 10000, gainM: 400 };
  const all = await findRoutes(target, { apiKey: 'x', fetchImpl: fakeOrsFetch, sleep: async () => {} });
  const around = await findRoutes(target, { apiKey: 'x', fetchImpl: fakeOrsFetch, sleep: async () => {}, directions: [135, 180, 225] });
  assert.ok(around.requests < all.requests * 0.6, `around ${around.requests} vs all ${all.requests}`);
  for (const r of around.all) assert.ok([135, 180, 225].includes(r.heading), `heading ${r.heading}`);
});

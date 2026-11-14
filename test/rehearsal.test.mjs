import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  gainCurve, patternPenalty, bestDirection, loopDirection, summarizeRace, rehearsalGain, isValidCurve, CURVE_SAMPLES,
} from '../src/rehearsal.mjs';
import { parseGpx } from '../src/gpx.mjs';
import { findRoutes } from '../src/engine.mjs';
import { fakeOrsFetch } from '../src/fake-ors.mjs';

// Made-up straight routes, a point every 50 m, elevation from distance run.
const M_PER_DEG_LON = 111320 * Math.cos((46.77 * Math.PI) / 180);
function line(totalM, elevationAt) {
  const coords = [];
  for (let d = 0; d <= totalM; d += 50) coords.push([23.6 + d / M_PER_DEG_LON, 46.77, elevationAt(d)]);
  return coords;
}
// All the climbing in the first 30% / the last 30%.
const frontLoaded = (L) => line(L, (d) => 400 + 300 * Math.min(1, d / (0.3 * L)));
const backLoaded = (L) => line(L, (d) => 400 + 300 * Math.max(0, (d - 0.7 * L) / (0.3 * L)));

test('gainCurve runs from 0 to 1 and never goes down', () => {
  const c = gainCurve(frontLoaded(10000));
  assert.equal(c.length, CURVE_SAMPLES + 1);
  assert.equal(c[0], 0);
  assert.equal(c.at(-1), 1);
  assert.ok(c.every((v, i) => i === 0 || v >= c[i - 1]));
  assert.ok(c[20] > 0.95, 'front-loaded: nearly all climbing done by 40%');
  assert.ok(isValidCurve(c));
  assert.ok(!isValidCurve([0, 0.5, 2]));
});

test('same pattern at different lengths matches; opposite pattern does not', () => {
  const race = gainCurve(frontLoaded(42000));
  assert.ok(patternPenalty(gainCurve(frontLoaded(12000)), race) < 5);
  assert.ok(patternPenalty(gainCurve(backLoaded(12000)), race) > 80);
});

test('bestDirection flips a loop when running it the other way matches better', () => {
  // Loops start and finish at the same height, so going the other way turns descents into climbs.
  const tri = (d, a, b, c) => (d < a || d > c ? 0 : d <= b ? (d - a) / (b - a) : (c - d) / (c - b));
  // Climb in the first 20%, down by 40%, flat after.
  const climbEarly = (L) => line(L, (d) => 400 + 300 * tri(d / L, 0, 0.2, 0.4));
  // Flat until 60%, climb to 80%, back down by the end: the same loop run the other way.
  const climbLate = (L) => line(L, (d) => 400 + 300 * tri(d / L, 0.6, 0.8, 1));
  const race = gainCurve(climbEarly(42000));
  const r = bestDirection(climbLate(12000), race);
  assert.equal(r.reversed, true);
  assert.ok(r.penalty < 5, `penalty ${r.penalty}`);
  assert.equal(bestDirection(climbEarly(12000), race).reversed, false);
});

test('loopDirection tells clockwise from anticlockwise', () => {
  const square = [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]; // north, east, south, west = clockwise
  assert.equal(loopDirection(square), 'clockwise');
  assert.equal(loopDirection([...square].reverse()), 'anticlockwise');
  assert.equal(loopDirection([[0, 0], [1, 0.001], [0, 0]]), null); // out-and-back
});

test('sample race: summary finds its two big climbs in order', () => {
  const race = summarizeRace(parseGpx(readFileSync('samples/sample-mountain-marathon.gpx', 'utf8')), 'Sample');
  assert.ok(Math.abs(race.distanceM - 42195) < 300);
  assert.ok(race.gainM > 1700 && race.gainM < 2000, `gain ${race.gainM}`);
  const big = race.climbs.filter((c) => c.gainM > 400);
  assert.equal(big.length, 2);
  assert.ok(big[0].startPct < 30 && big[1].startPct > 70);
  assert.equal(rehearsalGain(race, 15), Math.round((race.gainPerKm * 15) / 10) * 10);
  assert.ok(race.profile.length > 50 && race.profile.length <= 250);
});

test('findRoutes with a race pattern adds a pattern penalty and may reverse loops', async () => {
  const race = summarizeRace(parseGpx(readFileSync('samples/sample-mountain-marathon.gpx', 'utf8')));
  const target = { lat: 46.7712, lon: 23.6236, distanceM: 15000, gainM: rehearsalGain(race, 15), pattern: race.curve };
  const r = await findRoutes(target, { apiKey: 'x', fetchImpl: fakeOrsFetch, sleep: async () => {} });
  assert.equal(r.routes.length, 3);
  for (const x of r.routes) {
    assert.ok(Number.isFinite(x.patternPenalty));
    // The kept direction is never worse than the other one.
    assert.ok(x.patternPenalty <= patternPenalty(gainCurve([...x.coords].reverse()), race.curve) + 1e-9);
  }
});

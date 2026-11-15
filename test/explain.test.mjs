import test from 'node:test';
import assert from 'node:assert/strict';
import { steepest, explainRoute } from '../src/explain.mjs';
import { summarizeRoute } from '../src/summary.mjs';

// Straight route east, a point every 50 m, elevation from distance.
const M_PER_DEG_LON = 111320 * Math.cos((46.77 * Math.PI) / 180);
function line(totalM, ele) {
  const coords = [];
  for (let d = 0; d <= totalM; d += 50) coords.push([23.6 + d / M_PER_DEG_LON, 46.77, ele(d)]);
  return coords;
}
// Gentle 5% climb, then a 300 m wall at 25% around km 3, then a 30% drop at km 6.
const profile = (d) => (d < 3000 ? 400 + 0.05 * d
  : d < 3300 ? 550 + 0.25 * (d - 3000)
    : d < 6000 ? 625
      : d < 6300 ? 625 - 0.30 * (d - 6000) : 535);

test('steepest finds the wall and the drop', () => {
  const r = summarizeRoute(line(8000, profile));
  const s = steepest(r.coords, r.along);
  assert.equal(s.up.pct, 25);
  assert.ok(s.up.km >= 3 && s.up.km <= 3.1, `up at ${s.up.km}`);
  assert.equal(s.down.pct, -30);
  assert.ok(s.down.km >= 6 && s.down.km <= 6.1);
});

test('explainRoute: reasons, warnings and notes', () => {
  const r = summarizeRoute(line(8000, profile), {
    accuracy: 3, extra: 5, closeEnough: true,
    surface: { trail: 62, gravel: 0, paved: 8, unknown: 30, road: 30 },
  });
  r.water = { stops: [], longestDryKm: 8 };
  const e = explainRoute(r, { distanceM: 8000, gainM: 225 }, [r]);
  assert.equal(e.rankNote, 'Closest of all to your distance and climbing.');
  assert.deepEqual(e.reasons.map((x) => [x.label, x.good]), [['Distance', true], ['Climbing', true], ['Trail', true]]);
  assert.match(e.reasons[0].value, /8\.0 km \(0% vs 8 km\)/);
  assert.ok(e.warnings.some((w) => /Steep climb: 25% at km 3/.test(w)));
  assert.ok(e.warnings.some((w) => /Steep descent: 30% at km 6/.test(w)));
  assert.ok(e.warnings.some((w) => /30% is on roads/.test(w)));
  assert.ok(e.warnings.some((w) => /Surface unknown for 30%/.test(w)));
  assert.ok(!e.warnings.some((w) => /water/.test(w)), 'under 10 km: no water warning');
});

test('rank notes explain why a less accurate route is shown', () => {
  const flat = line(10000, () => 400);
  const best = summarizeRoute(flat, { accuracy: 4, extra: 8, closeEnough: true, surface: { trail: 30, road: 0, unknown: 0 } });
  const trailier = summarizeRoute(flat, { accuracy: 9, extra: 2, closeEnough: true, surface: { trail: 80, road: 0, unknown: 0 } });
  const far = summarizeRoute(flat, { accuracy: 30, extra: 0, closeEnough: false });
  const all = [trailier, best, far];
  const target = { distanceM: 10000, gainM: 300 };
  assert.equal(explainRoute(best, target, all).rankNote, 'Closest of all to your distance and climbing.');
  assert.equal(explainRoute(trailier, target, all).rankNote,
    'Nearly as close to your targets as the most accurate route (5 points behind), with more trail.');
  assert.match(explainRoute(far, target, all).rankNote, /alternative/);
  // Saved routes have no target: no rank note, no distance/climbing reasons.
  const saved = explainRoute(summarizeRoute(flat), null);
  assert.equal(saved.rankNote, null);
  assert.equal(saved.reasons.length, 0);
});

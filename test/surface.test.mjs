import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeSurface, describeSurface } from '../src/surface.mjs';
import { findRoutes } from '../src/engine.mjs';
import { fakeOrsFetch } from '../src/fake-ors.mjs';

// 11 points in a straight line, 10 equal stretches of ~100 m.
const coords = Array.from({ length: 11 }, (_, i) => [23.6 + i * 0.0013, 46.77, 400]);

test('surface breakdown groups ORS codes into trail / gravel / paved / unknown', () => {
  const extras = {
    surface: { values: [[0, 3, 3], [3, 5, 10], [5, 8, 11], [8, 10, 0]] }, // asphalt, gravel, dirt, unknown
    waytype: { values: [[0, 3, 3], [3, 5, 5], [5, 8, 4], [8, 9, 4], [9, 10, 7]] }, // street, track, path, path, footway
  };
  const s = summarizeSurface(coords, extras);
  // Unknown surface on a path counts as trail; unknown on a footway stays unknown.
  assert.deepEqual({ trail: s.trail, gravel: s.gravel, paved: s.paved, unknown: s.unknown, road: s.road },
    { trail: 40, gravel: 20, paved: 30, unknown: 10, road: 30 });
  assert.deepEqual(s.sections, [[0, 3, 'paved'], [3, 5, 'gravel'], [5, 9, 'trail'], [9, 10, 'unknown']]);
  assert.equal(describeSurface(s), '40% trail · 20% gravel · 30% paved · 10% unknown');
});

test('older response key "waytypes" also works; no surface info gives null', () => {
  const s = summarizeSurface(coords, { surface: { values: [[0, 10, 0]] }, waytypes: { values: [[0, 10, 5]] } });
  assert.equal(s.trail, 100);
  assert.equal(summarizeSurface(coords, undefined), null);
  assert.equal(describeSurface(null), null);
});

test('practice search returns a surface breakdown and prefers trail among close routes', async () => {
  const target = { lat: 46.7712, lon: 23.6236, distanceM: 15000, gainM: 500 };
  const opts = { apiKey: 'x', fetchImpl: fakeOrsFetch, sleep: async () => {} };
  const withTrail = await findRoutes(target, opts);
  for (const r of withTrail.routes) {
    assert.ok(r.surface, 'every route has a surface breakdown');
    assert.equal(r.surface.trail + r.surface.gravel + r.surface.paved + r.surface.unknown >= 98, true);
  }
  const noTrail = await findRoutes(target, { ...opts, trailWeight: 0 });
  const avg = (rs) => rs.reduce((s, r) => s + r.surface.trail, 0) / rs.length;
  assert.ok(avg(withTrail.routes) >= avg(noTrail.routes), 'trail preference never lowers trail share');
});

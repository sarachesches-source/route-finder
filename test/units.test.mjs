import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultUnits, dist, elev, at, distToM, elevToM, rate } from '../src/units.mjs';
import { explainRoute } from '../src/explain.mjs';
import { summarizeRoute } from '../src/summary.mjs';

test('default units follow the browser locale', () => {
  assert.equal(defaultUnits('en-US'), 'imperial');
  assert.equal(defaultUnits('en-GB'), 'metric');
  assert.equal(defaultUnits('ro-RO'), 'metric');
  assert.equal(defaultUnits(''), 'metric');
});

test('formatting and conversion both ways', () => {
  assert.equal(dist(16093.44, 'imperial'), '10.0 mi');
  assert.equal(dist(15100, 'metric'), '15.1 km');
  assert.equal(elev(609.6, 'imperial'), '2,000 ft');
  assert.equal(elev(504.4, 'metric'), '504 m');
  assert.equal(at(8400, 'metric'), 'km 8.4');
  assert.equal(at(8046.72, 'imperial'), 'mile 5.0');
  assert.ok(Math.abs(distToM(10, 'imperial') - 16093.44) < 0.01);
  assert.ok(Math.abs(elevToM(2000, 'imperial') - 609.6) < 0.1);
  assert.equal(distToM(15, 'metric'), 15000);
  assert.equal(rate(44, 'metric'), '44 m per km');
  assert.equal(rate(44, 'imperial'), '232 ft per mile');
});

test('"Why this route" speaks miles and feet when asked, metric by default', () => {
  const M = 111320 * Math.cos((46.77 * Math.PI) / 180);
  const coords = Array.from({ length: 161 }, (_, i) => [23.6 + (i * 100) / M, 46.77, 400 + (i > 80 && i < 84 ? (i - 80) * 25 : i >= 84 ? 75 : 0)]);
  const r = summarizeRoute(coords, { accuracy: 1, extra: 0, closeEnough: true });
  const target = { distanceM: 16093.44, gainM: 609.6 };
  const us = explainRoute(r, target, [r], { units: 'imperial' });
  assert.match(us.reasons[0].value, /mi \(.*vs 10\.0 mi\)/);
  assert.match(us.reasons[1].value, /ft \(.*vs 2,000 ft\)/);
  assert.ok(us.warnings.some((w) => /at mile \d+\.\d/.test(w)), us.warnings.join(' | '));
  const eu = explainRoute(r, target, [r]);
  assert.match(eu.reasons[0].value, /km \(.*vs 16 km\)/);
  assert.ok(eu.warnings.some((w) => /at km \d+\.\d/.test(w)));
});

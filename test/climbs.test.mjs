import test from 'node:test';
import assert from 'node:assert/strict';
import { findClimbs, shapePenalty, describeShape } from '../src/climbs.mjs';

// Build a made-up route: positions every 50 m, position(i) in metres east of the start,
// elevation from a function of distance run so far.
const STEP = 50, M_PER_DEG_LON = 111320 * Math.cos((46.77 * Math.PI) / 180);
function route(totalM, positionAt, elevationAt) {
  const coords = [];
  for (let d = 0; d <= totalM; d += STEP) coords.push([23.6 + positionAt(d) / M_PER_DEG_LON, 46.77, elevationAt(d)]);
  return coords;
}
const straight = (d) => d;
const wiggle = (d) => 1.4 * Math.sin(d / 37); // GPS-style noise that should be ignored

// One 400 m climb over 3 km, then down.
const longClimb = route(6000, straight, (d) => 400 + (d <= 3000 ? d / 3000 : (6000 - d) / 3000) * 400 + wiggle(d));
// Six 50 m hills over 12 km.
const rolling = route(12000, straight, (d) => 400 + 25 * (1 - Math.cos((2 * Math.PI * d) / 2000)) + wiggle(d));
// Up and down the same 1 km, 80 m hill four times.
const shuttle = (d) => { const p = d % 2000; return p <= 1000 ? p : 2000 - p; };
const repeats = route(8000, shuttle, (d) => 400 + 0.08 * shuttle(d));

test('findClimbs sees one long climb and ignores noise', () => {
  const climbs = findClimbs(longClimb);
  assert.equal(climbs.length, 1);
  assert.ok(Math.abs(climbs[0].gainM - 400) <= 10, `gain ${climbs[0].gainM}`);
  assert.ok(Math.abs(climbs[0].lengthM - 3000) <= 150, `length ${climbs[0].lengthM}`);
  assert.ok(Math.abs(climbs[0].grade - 0.133) < 0.01);
});

test('findClimbs counts rolling hills and repeats', () => {
  assert.equal(findClimbs(rolling).length, 6);
  assert.equal(findClimbs(repeats).length, 4);
});

test('each made-up route fits its own shape best', () => {
  assert.equal(describeShape(longClimb).bestFit, 'long');
  assert.equal(describeShape(rolling).bestFit, 'rolling');
  assert.equal(describeShape(repeats).bestFit, 'repeats');
});

test('penalties: perfect matches near 0, mismatches high', () => {
  assert.equal(shapePenalty(findClimbs(longClimb), 'long'), 0);
  assert.equal(shapePenalty(findClimbs(rolling), 'rolling'), 0);
  assert.equal(shapePenalty(findClimbs(repeats), 'repeats'), 0);
  assert.ok(shapePenalty(findClimbs(longClimb), 'rolling') >= 50);
  assert.ok(shapePenalty(findClimbs(rolling), 'repeats') >= 50);
  assert.equal(shapePenalty([], 'long'), 100);
  assert.throws(() => shapePenalty(findClimbs(rolling), 'zigzag'), /Unknown shape/);
});

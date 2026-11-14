// Climb shaping: find the climbs in a route and score how well its profile matches
// the kind of run the runner asked for.
//   long    - one big sustained climb (e.g. a mountain ascent)
//   rolling - many small ups and downs, none dominating
//   repeats - the same hill climbed several times
import { routeLength, elevationGain } from './engine.mjs';

function haversine(a, b) { return routeLength([a, b]); }

/**
 * Turning points of the elevation profile (valleys and peaks), ignoring wiggles
 * smaller than `dip` metres so a short flat bit doesn't split one climb in two.
 */
function turningPoints(ele, dip) {
  let lo = 0, hi = 0, dir = 0, ext = 0;
  const piv = [];
  for (let i = 1; i < ele.length; i++) {
    if (dir === 0) {
      if (ele[i] > ele[hi]) hi = i;
      if (ele[i] < ele[lo]) lo = i;
      if (ele[hi] - ele[lo] >= dip) {
        dir = hi > lo ? 1 : -1;
        piv.push(dir === 1 ? lo : hi);
        ext = dir === 1 ? hi : lo;
      }
    } else if (dir === 1) {
      if (ele[i] >= ele[ext]) ext = i;
      else if (ele[ext] - ele[i] >= dip) { piv.push(ext); dir = -1; ext = i; }
    } else {
      if (ele[i] <= ele[ext]) ext = i;
      else if (ele[i] - ele[ext] >= dip) { piv.push(ext); dir = 1; ext = i; }
    }
  }
  if (dir !== 0) piv.push(ext);
  return piv;
}

/**
 * List the climbs in a route: each one has where it starts and ends (metres along the
 * route), how much it rises, and its average gradient.
 * @param coords [[lon, lat, ele], ...]
 */
export function findClimbs(coords, { dip = 10, minGain = 30 } = {}) {
  const ele = coords.map((c) => c[2] ?? 0);
  const along = [0];
  for (let i = 1; i < coords.length; i++) along.push(along[i - 1] + haversine(coords[i - 1], coords[i]));
  const piv = turningPoints(ele, dip);
  const climbs = [];
  for (let k = 1; k < piv.length; k++) {
    const a = piv[k - 1], b = piv[k];
    const gainM = ele[b] - ele[a];
    if (gainM < minGain) continue;
    const lengthM = along[b] - along[a];
    climbs.push({
      startM: Math.round(along[a]), endM: Math.round(along[b]), lengthM: Math.round(lengthM),
      gainM: Math.round(gainM), grade: lengthM > 0 ? gainM / lengthM : 0,
      from: coords[a], to: coords[b],
    });
  }
  return climbs;
}

/** Largest group of climbs that are the same hill: same start and top (within `nearM`), similar size. */
function biggestRepeatGroup(climbs, nearM = 150) {
  let best = [];
  for (const c of climbs) {
    const group = climbs.filter((o) =>
      haversine(o.from, c.from) < nearM && haversine(o.to, c.to) < nearM &&
      Math.abs(o.gainM - c.gainM) <= 0.25 * c.gainM);
    if (group.length > best.length) best = group;
  }
  return best;
}

export const SHAPES = ['long', 'rolling', 'repeats'];

/**
 * How far a route is from the wanted shape: 0 = perfect, roughly 100 = completely wrong.
 * Same scale as the distance/climbing score, so they can be added together.
 */
export function shapePenalty(climbs, shape, { reps = 3, routeGainM = 0 } = {}) {
  if (!climbs.length) return 100;
  // Shares are of the whole route's climbing, so lots of small bumps count against 'long'.
  const total = Math.max(climbs.reduce((s, c) => s + c.gainM, 0), routeGainM);
  const biggestShare = Math.max(...climbs.map((c) => c.gainM)) / total;
  if (shape === 'long') {
    // Want most of the climbing in one go.
    return 100 * Math.min(1, Math.max(0, 0.75 - biggestShare) / 0.75);
  }
  if (shape === 'rolling') {
    // Want at least 4 climbs and no single climb more than ~35% of the total.
    return Math.min(100, 100 * Math.max(0, biggestShare - 0.35) + 15 * Math.max(0, 4 - climbs.length));
  }
  if (shape === 'repeats') {
    // Want the same hill `reps` times, and most of the climbing to come from it.
    const group = biggestRepeatGroup(climbs);
    const groupShare = group.reduce((s, c) => s + c.gainM, 0) / total;
    return Math.min(100, 25 * Math.max(0, reps - group.length) + 50 * (1 - groupShare));
  }
  throw new Error(`Unknown shape "${shape}". Use one of: ${SHAPES.join(', ')}`);
}

/** Penalty for every shape, plus the climb list: handy for showing why a route got its score. */
export function describeShape(coords) {
  const climbs = findClimbs(coords);
  const routeGainM = elevationGain(coords);
  const penalties = Object.fromEntries(SHAPES.map((s) => [s, Math.round(shapePenalty(climbs, s, { routeGainM }))]));
  // Repeats also look "rolling", so on a tie prefer the more specific shape.
  const best = ['repeats', 'long', 'rolling'].reduce((a, b) => (penalties[a] <= penalties[b] ? a : b));
  return { climbs, penalties, bestFit: climbs.length ? best : 'flat' };
}

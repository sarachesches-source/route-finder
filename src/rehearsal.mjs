// Race rehearsal: describe a race's climbing pattern and score how well a local
// route copies it, scaled to the training distance.
//
// The pattern is the "climbing curve": how much of the total climb is done at each
// point of the run (0% .. 100% of the distance). Two routes with similar curves
// have their climbs in the same places, even if one is 50 km and the other 15 km.
import { routeLength, cleanElevation } from './engine.mjs';
import { findClimbs } from './climbs.mjs';

export const CURVE_SAMPLES = 50; // curve has CURVE_SAMPLES + 1 points, at 0%, 2%, ... 100%

/** Share of total climbing done (0..1) at each 2% of the distance. Flat route: a straight line. */
export function gainCurve(coords, samples = CURVE_SAMPLES, threshold = 3) {
  const along = [0], gain = [0];
  let ref = coords[0]?.[2] ?? 0, total = 0;
  for (let i = 1; i < coords.length; i++) {
    along.push(along[i - 1] + routeLength([coords[i - 1], coords[i]]));
    const diff = coords[i][2] - ref;
    if (diff >= threshold) { total += diff; ref = coords[i][2]; }
    else if (diff <= -threshold) ref = coords[i][2];
    gain.push(total);
  }
  const length = along.at(-1) || 1;
  const curve = [];
  let j = 0;
  for (let k = 0; k <= samples; k++) {
    if (!total) { curve.push(k / samples); continue; }
    const d = (length * k) / samples;
    while (j < along.length - 1 && along[j + 1] <= d) j++;
    curve.push(Math.round((gain[j] / total) * 1000) / 1000);
  }
  return curve;
}

/** 0 = climbs in exactly the same places, 100 = completely different pattern. */
export function patternPenalty(routeCurve, raceCurve) {
  let sum = 0;
  for (let k = 0; k < raceCurve.length; k++) sum += Math.abs(routeCurve[k] - raceCurve[k]);
  return Math.min(100, (250 * sum) / raceCurve.length);
}

/**
 * Score a loop both ways round and keep the better direction.
 * Returns { penalty, reversed }; reversed = true means run the loop the other way.
 */
export function bestDirection(coords, raceCurve) {
  const forward = patternPenalty(gainCurve(coords), raceCurve);
  const backward = patternPenalty(gainCurve([...coords].reverse()), raceCurve);
  return backward < forward ? { penalty: backward, reversed: true } : { penalty: forward, reversed: false };
}

/** Clockwise / anticlockwise for a loop, or null if it's too thin to tell (out-and-back). */
export function loopDirection(coords) {
  let area = 0, minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (let i = 0; i < coords.length; i++) {
    const [x1, y1] = coords[i], [x2, y2] = coords[(i + 1) % coords.length];
    area += x1 * y2 - x2 * y1;
    minLon = Math.min(minLon, x1); maxLon = Math.max(maxLon, x1);
    minLat = Math.min(minLat, y1); maxLat = Math.max(maxLat, y1);
  }
  const box = (maxLon - minLon) * (maxLat - minLat);
  if (!box || Math.abs(area / 2) < 0.1 * box) return null;
  return area > 0 ? 'anticlockwise' : 'clockwise';
}

/**
 * Everything the app needs about an uploaded race: size, main climbs, and its pattern.
 * `profile` is a small elevation outline (fraction of distance, 0..1 height) for drawing.
 */
export function summarizeRace(rawCoords, name = 'Race') {
  const coords = cleanElevation(rawCoords); // watch recordings often have elevation blips
  const along = [0];
  for (let i = 1; i < coords.length; i++) along.push(along[i - 1] + routeLength([coords[i - 1], coords[i]]));
  const distanceM = along.at(-1) ?? 0;
  const curve = gainCurve(coords);
  let gainM = 0, ref = coords[0]?.[2] ?? 0;
  for (const c of coords) {
    const diff = c[2] - ref;
    if (diff >= 3) { gainM += diff; ref = c[2]; } else if (diff <= -3) ref = c[2];
  }
  gainM = Math.round(gainM);
  // Main climbs: anything at least 8% of the race's total climbing, in race order.
  const climbs = findClimbs(coords, { minGain: Math.max(30, gainM * 0.08) }).map((c) => ({
    startM: c.startM, endM: c.endM, gainM: c.gainM, grade: c.grade,
    startPct: Math.round((100 * c.startM) / distanceM), endPct: Math.round((100 * c.endM) / distanceM),
  }));
  const ele = coords.map((c) => c[2]);
  const lo = Math.min(...ele), hi = Math.max(...ele);
  const step = Math.max(1, Math.floor(coords.length / 200));
  const profile = [];
  for (let i = 0; i < coords.length; i += step) {
    profile.push([Math.round((1000 * along[i]) / distanceM) / 1000, hi > lo ? Math.round((1000 * (ele[i] - lo)) / (hi - lo)) / 1000 : 0.5]);
  }
  return { name, distanceM, gainM, gainPerKm: distanceM ? (gainM * 1000) / distanceM : 0, climbs, curve, profile };
}

/** Climbing to aim for on a training run of `km`, keeping the race's metres-per-km. */
export function rehearsalGain(race, km) {
  return Math.round((race.gainPerKm * km) / 10) * 10;
}

/** Check a curve sent from the browser before trusting it. */
export function isValidCurve(curve) {
  return Array.isArray(curve) && curve.length === CURVE_SAMPLES + 1 &&
    curve.every((v, k) => typeof v === 'number' && v >= 0 && v <= 1 && (k === 0 || v >= curve[k - 1] - 1e-9));
}

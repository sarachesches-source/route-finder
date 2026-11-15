// Race rehearsal: describe a race's climbing pattern and score how well a local
// route copies it, scaled to the training distance.
//
// A race's pattern has three parts, each compared on a 0..100 scale (0 = same):
//  - climbing curve: how much of the total climb is done at each point of the run
//    (0% .. 100% of the distance), so climbs come in the same places
//  - descent curve: the same for downhill, so descents come in the same places
//  - steepness mix: share of distance that is flat, gentle, steep or very steep,
//    up and down - a 10% grind and a 25% wall train different things
// Two routes can match even if one is 50 km and the other 15 km.
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

/** Share of total descent done at each 2% of the distance (climbing curve of the route upside down). */
export function descentCurve(coords, samples = CURVE_SAMPLES) {
  return gainCurve(coords.map(([lon, lat, ele]) => [lon, lat, -(ele ?? 0)]), samples);
}

// Steepness bands in % grade, steepest descent first. Labels are for display.
export const GRADE_BANDS = [
  { max: -20, label: 'very steep down' }, { max: -10, label: 'steep down' }, { max: -3, label: 'gentle down' },
  { max: 3, label: 'flat' }, { max: 10, label: 'gentle up' }, { max: 20, label: 'steep up' },
  { max: Infinity, label: 'very steep up' },
];

/** Share of the distance (0..1) in each GRADE_BANDS band, measured over ~`stepM` pieces. */
export function gradeMix(coords, stepM = 100) {
  const mix = GRADE_BANDS.map(() => 0);
  let total = 0, from = 0, run = 0;
  for (let i = 1; i < coords.length; i++) {
    run += routeLength([coords[i - 1], coords[i]]);
    if (run < stepM && i < coords.length - 1) continue;
    if (run > 0) {
      const pct = (100 * ((coords[i][2] ?? 0) - (coords[from][2] ?? 0))) / run;
      mix[GRADE_BANDS.findIndex((b) => pct < b.max)] += run;
      total += run;
    }
    from = i; run = 0;
  }
  return mix.map((m) => (total ? Math.round((1000 * m) / total) / 1000 : 0));
}

/** The three-part pattern of a route or race. */
export function racePattern(coords) {
  return { climb: gainCurve(coords), descent: descentCurve(coords), grades: gradeMix(coords) };
}

/** 0 = climbs in exactly the same places, 100 = completely different (two climbing/descent curves). */
export function patternPenalty(routeCurve, raceCurve) {
  let sum = 0;
  for (let k = 0; k < raceCurve.length; k++) sum += Math.abs(routeCurve[k] - raceCurve[k]);
  return Math.min(100, (250 * sum) / raceCurve.length);
}

/** 0 = same steepness mix, 100 = nothing in common. */
export function mixPenalty(routeMix, raceMix) {
  let sum = 0;
  for (let k = 0; k < raceMix.length; k++) sum += Math.abs(routeMix[k] - raceMix[k]);
  return Math.min(100, 125 * (sum / 2)); // sum/2 = share of distance in the "wrong" band
}

const PART_WEIGHTS = { climb: 0.45, descent: 0.25, steepness: 0.3 };

/** Older callers pass just the climbing curve (an array). */
function asPattern(pattern) {
  return Array.isArray(pattern) ? { climb: pattern } : pattern;
}

/**
 * How well a route copies a race pattern.
 * @returns { penalty, parts: { climb, descent?, steepness? } }  all 0..100, 0 = same
 */
export function matchRace(coords, pattern) {
  const p = asPattern(pattern);
  const parts = { climb: patternPenalty(gainCurve(coords), p.climb) };
  if (p.descent) parts.descent = patternPenalty(descentCurve(coords), p.descent);
  if (p.grades) parts.steepness = mixPenalty(gradeMix(coords), p.grades);
  let sum = 0, weight = 0;
  for (const [k, v] of Object.entries(parts)) { sum += PART_WEIGHTS[k] * v; weight += PART_WEIGHTS[k]; }
  for (const k of Object.keys(parts)) parts[k] = Math.round(parts[k]);
  return { penalty: sum / weight, parts };
}

/**
 * Score a loop both ways round and keep the better direction.
 * Returns { penalty, parts, reversed }; reversed = true means run the loop the other way.
 */
export function bestDirection(coords, pattern) {
  const forward = matchRace(coords, pattern);
  const backward = matchRace([...coords].reverse(), pattern);
  return backward.penalty < forward.penalty ? { ...backward, reversed: true } : { ...forward, reversed: false };
}

/** "very steep up 6% · steep up 18% · ..." for the bands that matter (at least 3%). */
export function describeGrades(mix) {
  return GRADE_BANDS.map((b, i) => [b.label, Math.round(mix[i] * 100)])
    .filter(([label, pct]) => pct >= 3 && label !== 'flat')
    .map(([label, pct]) => `${pct}% ${label}`).join(' · ');
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
  const descent = descentCurve(coords);
  const grades = gradeMix(coords);
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
  return { name, distanceM, gainM, gainPerKm: distanceM ? (gainM * 1000) / distanceM : 0, climbs, curve, descent, grades, profile };
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

/** Check a steepness mix sent from the browser: one share per band, adding up to ~1. */
export function isValidMix(mix) {
  if (!Array.isArray(mix) || mix.length !== GRADE_BANDS.length) return false;
  if (!mix.every((v) => typeof v === 'number' && v >= 0 && v <= 1)) return false;
  const sum = mix.reduce((a, b) => a + b, 0);
  return sum === 0 || Math.abs(sum - 1) < 0.02;
}

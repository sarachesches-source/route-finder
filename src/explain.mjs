// "Why this route": plain-language reasons for a result's ranking, plus warnings a runner
// should know before going (steep bits, roads, no water, unknown surface).
// No network; works on routes from summary.mjs (browser or server).

/**
 * Steepest climb and descent over any `windowM` stretch (default 200 m), so one bad
 * elevation point doesn't count but a real wall does.
 * @returns { up: { pct, km }, down: { pct, km } }  (down.pct is negative)
 */
export function steepest(coords, along, windowM = 200) {
  const up = { pct: 0, km: 0 }, down = { pct: 0, km: 0 };
  let j = 0;
  for (let i = 0; i < coords.length; i++) {
    while (j < coords.length - 1 && along[j] - along[i] < windowM) j++;
    const run = along[j] - along[i];
    if (run < windowM * 0.8) break; // too close to the end for a full stretch
    const pct = (100 * (coords[j][2] - coords[i][2])) / run;
    const km = Math.round(along[i] / 100) / 10;
    if (pct > up.pct) Object.assign(up, { pct: Math.round(pct), km });
    if (pct < down.pct) Object.assign(down, { pct: Math.round(pct), km });
  }
  return { up, down };
}

const pctMiss = (value, target, floor = 1) => Math.round((100 * (value - target)) / Math.max(target, floor));
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
const fit = (p) => (p <= 15 ? 'strong' : p <= 40 ? 'partial' : 'weak');

/**
 * @param route   one result (summary + ranking fields: accuracy, extra, closeEnough, ...)
 * @param target  { distanceM, gainM, shape?, race? } or null for saved routes
 * @param routes  all results shown, to explain the ranking against the others
 * @returns { rankNote, reasons: [{ label, value, good }], warnings: [string], notes: [string] }
 *   good: true = in its favour, false = against it, null = neutral information
 */
export function explainRoute(route, target, routes = [route]) {
  const reasons = [], warnings = [], notes = [];
  let rankNote = null;

  if (target) {
    const d = pctMiss(route.distanceM, target.distanceM);
    const g = pctMiss(route.gainM, target.gainM, 50);
    reasons.push({ label: 'Distance', value: `${(route.distanceM / 1000).toFixed(1)} km (${signed(d)}% vs ${target.distanceM / 1000} km)`, good: Math.abs(d) <= 10 });
    reasons.push({ label: 'Climbing', value: `${route.gainM} m (${signed(g)}% vs ${target.gainM} m)`, good: Math.abs(g) <= 10 });
    if (route.shapePenalty != null) {
      reasons.push({ label: 'Climb shape', value: `${fit(route.shapePenalty)} match`, good: route.shapePenalty <= 40 });
    }
    if (route.patternPenalty != null) {
      reasons.push({ label: 'Race pattern', value: `${fit(route.patternPenalty)} match${route.direction ? `, run it ${route.direction}` : ''}`, good: route.patternPenalty <= 40 });
    }
    rankNote = rankReason(route, routes);
  }
  if (route.surface) {
    reasons.push({ label: 'Trail', value: `${route.surface.trail}% of the way`, good: route.surface.trail >= 50 ? true : route.surface.trail < 25 ? false : null });
  }

  // Warnings: things to know before you go.
  const steep = steepest(route.coords, route.along);
  if (steep.up.pct >= 20) warnings.push(`Steep climb: ${steep.up.pct}% at km ${steep.up.km.toFixed(1)}. Expect to hike it.`);
  if (steep.down.pct <= -20) warnings.push(`Steep descent: ${-steep.down.pct}% at km ${steep.down.km.toFixed(1)}. Careful when wet.`);
  if (route.surface?.road >= 25) warnings.push(`${route.surface.road}% is on roads with cars.`);
  if (route.surface?.unknown >= 30) warnings.push(`Surface unknown for ${route.surface.unknown}% (no OpenStreetMap data there).`);
  if (route.water && !route.water.stops.length && route.distanceM >= 10000) {
    warnings.push('No mapped water on the way. Carry what you need.');
  } else if (route.water?.longestDryKm >= 10) {
    warnings.push(`${route.water.longestDryKm.toFixed(1)} km without water at one point.`);
  }

  // Good-to-know notes.
  if (steep.up.pct > 0 && steep.up.pct < 20) notes.push(`Steepest climb: ${steep.up.pct}% at km ${steep.up.km.toFixed(1)}.`);
  if (route.bailout?.shortcuts?.length) notes.push(`Can be cut short at km ${route.bailout.shortcuts[0].km.toFixed(1)}.`);
  if (route.water?.stops?.length) notes.push(`${route.water.stops.length} water stop${route.water.stops.length > 1 ? 's' : ''} on the way.`);

  return { rankNote, reasons, warnings, notes };
}

/** One sentence on why this route sits where it does among the results. */
function rankReason(route, routes) {
  if (route.accuracy == null) return null;
  const ranked = routes.filter((r) => r.accuracy != null);
  const best = ranked.reduce((a, b) => (b.accuracy < a.accuracy ? b : a), ranked[0]);
  if (route === best || route.accuracy === best.accuracy) return 'Closest of all to your distance and climbing.';
  if (!route.closeEnough) return 'Further from your targets than the others: shown as an alternative.';
  const behind = Math.round(route.accuracy - best.accuracy);
  const wins = [];
  if (route.surface && best.surface && route.surface.trail > best.surface.trail + 5) wins.push('more trail');
  if (route.shapePenalty != null && route.shapePenalty + 5 < best.shapePenalty) wins.push('a better climb shape');
  if (route.patternPenalty != null && route.patternPenalty + 5 < best.patternPenalty) wins.push('a closer race pattern');
  return wins.length
    ? `Nearly as close to your targets as the most accurate route (${behind} points behind), with ${wins.join(' and ')}.`
    : `Nearly as close to your targets as the most accurate route (${behind} points behind): a different option.`;
}

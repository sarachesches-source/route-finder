// Surface breakdown: how much of a route is trail, gravel or paved, and how much is on
// roads with cars. Built from openrouteservice's "extra_info" (surface + waytype), which
// comes from OpenStreetMap tags. Codes: giscience.github.io/openrouteservice/api-reference/
// endpoints/directions/extra-info/surface and .../waytype
import { routeLength } from './engine.mjs';

const SURFACE_GROUP = {
  0: 'unknown',
  1: 'paved', 3: 'paved', 4: 'paved', 5: 'paved', 6: 'paved', 7: 'paved', 14: 'paved', 18: 'paved',
  8: 'gravel', 9: 'gravel', 10: 'gravel',
  2: 'trail', 11: 'trail', 12: 'trail', 13: 'trail', 15: 'trail', 16: 'trail', 17: 'trail',
};
const TRAIL_WAYS = new Set([4, 5]);   // path, track: count as trail when no surface is tagged
const ROAD_WAYS = new Set([1, 2, 3]); // state road, road, street: places with cars

export const SURFACE_GROUPS = ['trail', 'gravel', 'paved', 'unknown'];

/** Value at coordinate index i, from ORS [[from, to, value], ...] sections. */
function lookup(sections, i) {
  for (const [from, to, value] of sections) if (i >= from && i < to) return value;
  return null;
}

/**
 * @param coords  route points [[lon, lat, ele], ...]
 * @param extras  feature.properties.extras from openrouteservice (may be missing)
 * @returns null if there's no surface info, else
 *   { trail, gravel, paved, unknown, road } as whole percentages of the distance,
 *   and `sections`: [[fromIndex, toIndex, group], ...] for drawing on a map later.
 */
export function summarizeSurface(coords, extras) {
  const surface = extras?.surface?.values;
  const ways = (extras?.waytype ?? extras?.waytypes)?.values ?? [];
  if (!surface?.length || coords.length < 2) return null;

  const metres = { trail: 0, gravel: 0, paved: 0, unknown: 0 };
  let road = 0, total = 0;
  const sections = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const d = routeLength([coords[i], coords[i + 1]]);
    const way = lookup(ways, i);
    let group = SURFACE_GROUP[lookup(surface, i)] ?? 'unknown';
    if (group === 'unknown' && TRAIL_WAYS.has(way)) group = 'trail';
    metres[group] += d;
    if (ROAD_WAYS.has(way)) road += d;
    total += d;
    const last = sections.at(-1);
    if (last && last[2] === group) last[1] = i + 1; else sections.push([i, i + 1, group]);
  }
  if (!total) return null;
  const pct = (m) => Math.round((100 * m) / total);
  return { ...Object.fromEntries(SURFACE_GROUPS.map((g) => [g, pct(metres[g])])), road: pct(road), sections };
}

/** "78% trail · 15% gravel · 7% paved", leaving out groups under 1%. */
export function describeSurface(s) {
  if (!s) return null;
  return SURFACE_GROUPS.filter((g) => s[g] >= 1).map((g) => `${s[g]}% ${g}`).join(' · ');
}

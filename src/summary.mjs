// Everything the web app shows about one route, worked out from its points.
import { routeLength, elevationGain } from './engine.mjs';
import { describeShape } from './climbs.mjs';
import { bailoutInfo } from './bailout.mjs';
import { waterAlongRoute } from './water.mjs';
import { findClimbs, shapePenalty } from './climbs.mjs';
import { matchRace, loopDirection } from './rehearsal.mjs';

/**
 * @param coords [[lon, lat, ele], ...]
 * @param extra  fields to add or override (name, file, distanceM from the routing service, ...)
 */
export function summarizeRoute(coords, extra = {}) {
  const along = [0];
  for (let i = 1; i < coords.length; i++) along.push(along[i - 1] + routeLength([coords[i - 1], coords[i]]));
  const { climbs, penalties, bestFit } = describeShape(coords);
  return {
    coords, along,
    distanceM: along.at(-1) ?? 0,
    gainM: elevationGain(coords),
    climbs: climbs.map(({ from, to, ...c }) => c),
    penalties, bestFit,
    bailout: bailoutInfo(coords, along),
    water: null, // filled in by attachWater once water points are known
    ...extra,
  };
}

/** Add water stops to summarized routes. `points` null = water couldn't be loaded. */
export function attachWater(routes, points) {
  for (const r of routes) r.water = points ? waterAlongRoute(r.coords, r.along, points) : null;
  return routes;
}

/**
 * The same loop run the other way round: climbs, chart, water positions, bail-out and
 * surfaces recalculated, no new search needed. Distance and climbing stay the same, so its
 * place in the ranking doesn't change; climb shape and race pattern are re-scored.
 * @param options { shape, pattern } from the search target, to re-score those
 */
export function reverseRoute(route, { shape, pattern } = {}) {
  const coords = [...route.coords].reverse();
  const last = route.coords.length - 1;
  const surface = route.surface && {
    ...route.surface,
    sections: (route.surface.sections ?? []).map(([a, b, g]) => [last - b, last - a, g]).reverse(),
  };
  const keep = { ...route };
  for (const k of ['coords', 'along', 'climbs', 'penalties', 'bestFit', 'bailout', 'water', 'gainM']) delete keep[k];
  const out = summarizeRoute(coords, {
    ...keep,
    distanceM: route.distanceM,
    surface,
    direction: loopDirection(coords),
    reversed: !route.reversed,
    name: route.name.endsWith(' (reversed)') ? route.name.replace(' (reversed)', '') : `${route.name} (reversed)`,
  });
  // Climbing up the other way can differ by a few metres of noise; keep the searched figure.
  out.gainM = route.gainM;
  if (route.water) {
    const points = route.water.stops.map(({ lon, lat, kind, name, checkFirst }) => ({ lon, lat, kind, name, checkFirst }));
    out.water = waterAlongRoute(coords, out.along, points);
  }
  if (shape) out.shapePenalty = shapePenalty(findClimbs(coords), shape, { routeGainM: out.gainM });
  if (pattern) {
    const m = matchRace(coords, pattern);
    out.patternPenalty = m.penalty;
    out.patternParts = m.parts;
  }
  return out;
}

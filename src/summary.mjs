// Everything the web app shows about one route, worked out from its points.
import { routeLength, elevationGain } from './engine.mjs';
import { describeShape } from './climbs.mjs';
import { bailoutInfo } from './bailout.mjs';
import { waterAlongRoute } from './water.mjs';

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

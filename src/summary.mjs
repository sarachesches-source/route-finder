// Everything the web app shows about one route, worked out from its points.
import { routeLength, elevationGain } from './engine.mjs';
import { describeShape } from './climbs.mjs';

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
    ...extra,
  };
}

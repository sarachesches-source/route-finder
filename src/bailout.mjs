// Bail-out info for a loop: how far from the start you are along the way, and where the
// loop passes close to the start mid-run (a chance to cut the run short).
// Distances are straight lines ("as the crow flies"), so the real way back is longer.
import { routeLength } from './engine.mjs';

/**
 * @param coords [[lon, lat, ele], ...]
 * @param along  metres from the start at each point (same length as coords)
 * @returns {
 *   farthest: { km, backM },            // the point furthest from the start
 *   checkpoints: [{ km, backM }, ...],  // every `everyKm` km
 *   shortcuts: [{ km, backM }, ...],    // mid-run spots within `nearM` of the start
 * }
 */
export function bailoutInfo(coords, along, { everyKm = null, nearM = 1000 } = {}) {
  const total = along.at(-1) ?? 0;
  if (coords.length < 2 || !total) return null;
  const start = coords[0];
  const back = coords.map((c) => routeLength([c, start]));
  const step = (everyKm ?? (total > 30000 ? 5 : total > 12000 ? 2 : 1)) * 1000;

  let far = 0;
  for (let i = 1; i < back.length; i++) if (back[i] > back[far]) far = i;

  const checkpoints = [];
  let i = 0;
  for (let d = step; d < total - step / 2; d += step) {
    while (i < along.length - 1 && along[i] < d) i++;
    const j = i > 0 && d - along[i - 1] < along[i] - d ? i - 1 : i; // nearest point to d
    checkpoints.push({ km: round1(along[j] / 1000), backM: Math.round(back[j]) });
  }

  // Shortcut spots: between 25% and 75% of the run, the loop comes back within `nearM` of the
  // start. Keep the closest point of each such pass.
  const shortcuts = [];
  let pass = null;
  for (let k = 0; k < coords.length; k++) {
    const mid = along[k] > 0.25 * total && along[k] < 0.75 * total;
    if (mid && back[k] <= nearM) {
      if (!pass || back[k] < pass.backM) pass = { km: round1(along[k] / 1000), backM: Math.round(back[k]) };
    } else if (pass) { shortcuts.push(pass); pass = null; }
  }
  if (pass) shortcuts.push(pass);

  return { farthest: { km: round1(along[far] / 1000), backM: Math.round(back[far]) }, checkpoints, shortcuts };
}

const round1 = (x) => Math.round(x * 10) / 10;

/** Compass bearing (0 = north, 90 = east) from the start to the loop's farthest point. */
export function routeBearing(coords) {
  if (coords.length < 2) return 0;
  const start = coords[0];
  let far = coords[0], best = 0;
  for (const c of coords) { const d = routeLength([c, start]); if (d > best) { best = d; far = c; } }
  const rad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(rad(far[0] - start[0])) * Math.cos(rad(far[1]));
  const x = Math.cos(rad(start[1])) * Math.sin(rad(far[1])) - Math.sin(rad(start[1])) * Math.cos(rad(far[1])) * Math.cos(rad(far[0] - start[0]));
  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
}

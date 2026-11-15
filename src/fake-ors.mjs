// Practice mode: a stand-in for openrouteservice that invents routes over made-up
// terrain. Costs no API quota, so the app can be tried any time. Not real paths!
import { routeLength, offsetPoint } from './engine.mjs';

const M_PER_DEG = 111320;

/** Made-up hills: a ridge rising to the south-west of the start, plus rolling bumps. */
function terrain(lon, lat, lon0, lat0) {
  const x = (lon - lon0) * M_PER_DEG * Math.cos((lat0 * Math.PI) / 180);
  const y = (lat - lat0) * M_PER_DEG;
  const ridge = 600 * Math.max(0, Math.min(1, (-y - 0.5 * x) / 5000));
  const bumps = 25 * Math.sin(x / 700) * Math.cos(y / 900);
  return Math.round((340 + ridge + bumps) * 10) / 10;
}

/**
 * Made-up surfaces, as openrouteservice would report them: asphalt streets within 1.5 km of
 * the start, trails (paths) up on the ridge, gravel tracks elsewhere.
 * Returns [surface code, waytype code].
 */
function fakeSurface(lon, lat, lon0, lat0) {
  const x = (lon - lon0) * M_PER_DEG * Math.cos((lat0 * Math.PI) / 180);
  const y = (lat - lat0) * M_PER_DEG;
  if (Math.hypot(x, y) < 1500) return [3, 3];   // asphalt street
  if (-y - 0.5 * x > 1500) return [12, 4];      // ground, path
  return [10, 5];                               // gravel, track
}

/** ORS-style sections [[from, to, value], ...] from one value per point. */
function sections(perPoint) {
  const out = [];
  for (let i = 0; i < perPoint.length - 1; i++) {
    const last = out.at(-1);
    if (last && last[2] === perPoint[i]) last[1] = i + 1; else out.push([i, i + 1, perPoint[i]]);
  }
  return out;
}

/** Straight lines between waypoints, with a point every ~40 m. */
function densify(points, stepM = 40) {
  const out = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const n = Math.max(1, Math.ceil(routeLength([a, b]) / stepM));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  out.push(points.at(-1));
  return out;
}

export async function fakeOrsFetch(_url, init) {
  const body = JSON.parse(init.body);
  const [lon0, lat0] = body.coordinates[0];
  let waypoints;
  if (body.options?.round_trip) {
    // A polygon loop through the start, rotated by the seed.
    const { length, points, seed } = body.options.round_trip;
    const r = (length / (2 * Math.PI)) * 0.92;
    const rot = (seed * 137) % 360;
    const centre = offsetPoint(lon0, lat0, rot, r);
    waypoints = [];
    for (let k = 0; k <= points; k++) waypoints.push(offsetPoint(centre[0], centre[1], rot + 180 + (k * 360) / points, r));
    waypoints[0] = waypoints[points] = [lon0, lat0];
  } else {
    waypoints = body.coordinates;
  }
  const coords = densify(waypoints).map(([lon, lat]) =>
    [Number(lon.toFixed(6)), Number(lat.toFixed(6)), terrain(lon, lat, lon0, lat0)]);
  const surf = coords.map(([lon, lat]) => fakeSurface(lon, lat, lon0, lat0));
  const extras = body.extra_info
    ? { surface: { values: sections(surf.map((s) => s[0])) }, waytype: { values: sections(surf.map((s) => s[1])) } }
    : undefined;
  await new Promise((resolve) => setTimeout(resolve, 20)); // feel a little like a network call
  return {
    ok: true, status: 200, text: async () => '',
    json: async () => ({ features: [{ geometry: { type: 'LineString', coordinates: coords }, properties: { summary: { distance: routeLength(coords) }, extras } }] }),
  };
}

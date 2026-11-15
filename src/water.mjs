// Drinking water along a route, from OpenStreetMap (via the free Overpass API).
// This file has no network code, so the browser can use it too; fetching is in overpass.mjs.

/** Box around some routes, padded by `padM` metres: { s, w, n, e }, rounded so caching works. */
export function boundsOf(coordLists, padM = 200) {
  let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
  for (const coords of coordLists) for (const [lon, lat] of coords) {
    s = Math.min(s, lat); n = Math.max(n, lat); w = Math.min(w, lon); e = Math.max(e, lon);
  }
  const dLat = padM / 111320, dLon = padM / (111320 * Math.cos((((s + n) / 2) * Math.PI) / 180));
  const r = (x, up) => (up ? Math.ceil(x * 1000) : Math.floor(x * 1000)) / 1000;
  return { s: r(s - dLat, false), w: r(w - dLon, false), n: r(n + dLat, true), e: r(e + dLon, true) };
}

/** Overpass query for drinking fountains, taps, water points and springs in a box. */
export function waterQuery({ s, w, n, e }) {
  const box = `(${s},${w},${n},${e})`;
  return `[out:json][timeout:25];(` +
    `node["amenity"="drinking_water"]${box};` +
    `node["amenity"="water_point"]${box};` +
    `node["man_made"="water_tap"]${box};` +
    `node["natural"="spring"]${box};` +
    `);out body;`;
}

const KIND_WORDS = {
  drinking_water: 'drinking fountain', water_point: 'water point', water_tap: 'water tap', spring: 'spring',
};

/** Overpass JSON -> [{ lon, lat, kind, name, checkFirst }]. Skips places tagged "not drinkable". */
export function parseWater(json) {
  const out = [];
  for (const el of json?.elements ?? []) {
    const t = el.tags ?? {};
    if (t.drinking_water === 'no' || t.disused === 'yes') continue;
    const key = t.amenity === 'drinking_water' ? 'drinking_water'
      : t.amenity === 'water_point' ? 'water_point'
        : t.man_made === 'water_tap' ? 'water_tap' : 'spring';
    // Springs and taps are only confirmed drinkable when tagged drinking_water=yes.
    const checkFirst = key !== 'drinking_water' && t.drinking_water !== 'yes';
    out.push({ lon: el.lon, lat: el.lat, kind: KIND_WORDS[key], name: t.name ?? null, checkFirst });
  }
  return out;
}

/** Quick distance in metres; fine at running scale. */
function metres(a, b) {
  const kx = 111320 * Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 111320);
}

/**
 * Water within `maxOffM` of the route, in running order.
 * @returns { stops: [{ km, offM, kind, name, checkFirst, lon, lat }], longestDryKm }
 *   longestDryKm: longest stretch of the run with no water stop (start and finish count as stops).
 */
export function waterAlongRoute(coords, along, points, { maxOffM = 150 } = {}) {
  const stops = [];
  for (const p of points) {
    let best = Infinity, at = 0;
    for (let i = 0; i < coords.length; i++) {
      const d = metres(coords[i], [p.lon, p.lat]);
      if (d < best) { best = d; at = i; }
    }
    if (best <= maxOffM) stops.push({ ...p, km: Math.round(along[at] / 100) / 10, offM: Math.round(best) });
  }
  stops.sort((a, b) => a.km - b.km);
  // Several taps at the same spot count once.
  const unique = stops.filter((s, i) => i === 0 || s.km - stops[i - 1].km >= 0.2 || s.kind !== stops[i - 1].kind);
  const total = (along.at(-1) ?? 0) / 1000;
  const marks = [0, ...unique.map((s) => s.km), total];
  let longestDryKm = 0;
  for (let i = 1; i < marks.length; i++) longestDryKm = Math.max(longestDryKm, marks[i] - marks[i - 1]);
  return { stops: unique, longestDryKm: Math.round(longestDryKm * 10) / 10 };
}

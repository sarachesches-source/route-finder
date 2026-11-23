#!/usr/bin/env node
// Saves ready-made example searches to public/examples/, so visitors of the public site can
// see real results instantly, even when the daily search allowance is used up.
// Run after a real search with the same settings: answers come from .cache (0 new requests).
//   node scripts/make-examples.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { runSearch } from '../src/search.mjs';
import { parseGpx, gpxName } from '../src/gpx.mjs';
import { summarizeRace, rehearsalGain } from '../src/rehearsal.mjs';
import { cachedFetch } from '../src/ors-cache.mjs';

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim();
  }
}
const apiKey = process.env.ORS_API_KEY;
if (!apiKey) { console.log('ORS_API_KEY missing in .env'); process.exit(1); }

const start = { lat: 46.742, lon: 23.587 }; // edge of the Făget forest, Cluj-Napoca
const raceXml = readFileSync('samples/sample-mountain-marathon.gpx', 'utf8');
const race = summarizeRace(parseGpx(raceXml), gpxName(raceXml) ?? 'Sample race');

const boulder = { lat: 39.9989, lon: -105.2815 }; // Chautauqua Park trailhead, Boulder, Colorado
const examples = [
  {
    id: 'forest-edge',
    title: '15 km · 500 m from the Făget forest',
    params: { ...start, km: 15, vert: 500 },
  },
  {
    id: 'race-rehearsal',
    title: 'Rehearse a mountain marathon',
    race,
    params: { ...start, km: 15, vert: rehearsalGain(race, 15), pattern: { climb: race.curve, descent: race.descent, grades: race.grades } },
  },
  {
    id: 'boulder',
    title: '10 miles · 2,000 ft from Chautauqua, Boulder',
    params: { ...boulder, km: 16, vert: 610 },
  },
];

const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
mkdirSync('public/examples', { recursive: true });
for (const ex of examples) {
  const fetchImpl = cachedFetch(fetch);
  const result = await runSearch(ex.params, { apiKey, fetchImpl });
  // Smaller files: 6 decimals for position (~10 cm), 1 for elevation, whole metres along.
  for (const r of result.routes) {
    r.coords = r.coords.map(([lon, lat, ele]) => [round(lon, 6), round(lat, 6), round(ele ?? 0, 1)]);
    r.along = r.along.map((d) => Math.round(d));
  }
  const out = {
    id: ex.id, title: ex.title, start: { lat: ex.params.lat, lon: ex.params.lon },
    target: { distanceM: ex.params.km * 1000, gainM: ex.params.vert, race: ex.race ?? null },
    routes: result.routes,
  };
  const file = `public/examples/${ex.id}.json`;
  writeFileSync(file, JSON.stringify(out));
  console.log(`${file}: ${result.routes.length} routes, ${fetchImpl.stats.misses} new requests, ` +
    `${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
}

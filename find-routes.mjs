#!/usr/bin/env node
// Usage: node find-routes.mjs --lat 46.7712 --lon 23.6236 --km 15 --vert 500
//   --race race.gpx   copy that race's climbing pattern (climbing scaled to --km unless --vert given)
//   --practice        made-up routes, no API use
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { findRoutes, toGpx } from './src/engine.mjs';
import { SHAPES } from './src/climbs.mjs';
import { cachedFetch } from './src/ors-cache.mjs';
import { fakeOrsFetch } from './src/fake-ors.mjs';
import { parseGpx, gpxName } from './src/gpx.mjs';
import { summarizeRace, rehearsalGain, loopDirection, describeGrades } from './src/rehearsal.mjs';
import { describeSurface } from './src/surface.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean).map((p) => p.trim().split(/\s+/)));
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim();
  }
}
const target = {
  lat: Number(args.lat ?? 46.7712), lon: Number(args.lon ?? 23.6236), // default: central Cluj-Napoca
  distanceM: Number(args.km ?? 10) * 1000, gainM: Number(args.vert ?? 300),
  shape: args.shape, // optional: long | rolling | repeats
};
if (args.race) {
  if (!existsSync(args.race)) { console.log(`Race file not found: ${args.race}`); process.exit(1); }
  const xml = readFileSync(args.race, 'utf8');
  const race = summarizeRace(parseGpx(xml), gpxName(xml) ?? args.race);
  console.log(`Race: ${race.name}, ${(race.distanceM / 1000).toFixed(1)} km, ${race.gainM} m up (${Math.round(race.gainPerKm)} m/km)`);
  for (const c of race.climbs) console.log(`   +${c.gainM} m at ${c.startPct}-${c.endPct}% of the race`);
  target.pattern = { climb: race.curve, descent: race.descent, grades: race.grades };
  console.log(`   steepness: ${describeGrades(race.grades)}`);
  if (args.vert == null) target.gainM = rehearsalGain(race, target.distanceM / 1000);
}
if (target.shape && !SHAPES.includes(target.shape)) {
  console.log(`Unknown --shape "${target.shape}". Use one of: ${SHAPES.join(', ')}`);
  process.exit(1);
}
console.log(`Target: ${target.distanceM / 1000} km, ${target.gainM} m climbing` +
  `${target.shape ? `, shape ${target.shape}` : ''}${target.pattern ? ', race pattern' : ''}, from ${target.lat}, ${target.lon}`);
// Saved answers in .cache/ors make repeat searches free; --no-cache asks openrouteservice afresh.
const practice = 'practice' in args;
const fetchImpl = practice ? fakeOrsFetch : 'no-cache' in args ? fetch : cachedFetch(fetch);
if (practice) console.log('Practice mode: made-up routes over invented terrain, no API use.');
let result;
try {
  result = await findRoutes(target, {
    apiKey: practice ? 'practice' : process.env.ORS_API_KEY,
    fetchImpl,
    ...(practice && { sleep: async () => {} }),
    headings: Number(args.headings ?? 8),
    candidates: Number(args.candidates ?? 8),
    onProgress: (done, total) => process.stdout.write(`\r  checked ${done}/${total} loops`),
  });
} catch (e) {
  const quota = /quota exceeded/i.test(e.message);
  console.log(`\n${quota ? 'Daily openrouteservice limit reached - try again tomorrow.' : e.message.replace(/\s+/g, ' ')}`);
  if (fetchImpl.stats?.hits) console.log(`(${fetchImpl.stats.hits} answers came from cache)`);
  process.exit(1);
}
console.log(`\n${result.tried} loops found, ${result.failed} failed${result.errors.length ? ` (${result.errors[0]})` : ''}`);
if (fetchImpl.stats) console.log(`openrouteservice requests: ${fetchImpl.stats.misses} new, ${fetchImpl.stats.hits} from cache`);
console.log('');
// Practice routes are made up: keep them apart so they never replace real ones.
const outDir = practice ? 'out/practice' : 'out';
mkdirSync(outDir, { recursive: true });
result.routes.forEach((r, i) => {
  const dPct = ((r.distanceM - target.distanceM) / target.distanceM) * 100;
  const gPct = ((r.gainM - target.gainM) / Math.max(target.gainM, 50)) * 100;
  const file = `${outDir}/route-${i + 1}.gpx`;
  writeFileSync(file, toGpx(r, `Route ${i + 1}`));
  console.log(`#${i + 1}  ${(r.distanceM / 1000).toFixed(1)} km (${dPct >= 0 ? '+' : ''}${dPct.toFixed(0)}%)  ` +
    `${r.gainM} m up (${gPct >= 0 ? '+' : ''}${gPct.toFixed(0)}%)  ` +
    `${r.shapePenalty != null ? `shape miss ${Math.round(r.shapePenalty)}  ` : ''}` +
    `${r.patternPenalty != null ? `race-pattern miss ${Math.round(r.patternPenalty)} (climbs ${r.patternParts.climb}, descents ${r.patternParts.descent}, steepness ${r.patternParts.steepness})${loopDirection(r.coords) ? `, run ${loopDirection(r.coords)}` : ''}  ` : ''}score ${r.score.toFixed(1)}  ` +
    `[${r.kind === 'heading' ? `heading ${r.heading} deg` : `random seed ${r.seed}`}]  -> ${file}`);
  if (r.surface) console.log(`    ${describeSurface(r.surface)}  (${r.surface.road}% on roads/streets)`);
});

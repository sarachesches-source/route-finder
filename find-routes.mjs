#!/usr/bin/env node
// Usage: node find-routes.mjs --lat 46.7712 --lon 23.6236 --km 15 --vert 500
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { findRoutes, toGpx } from './src/engine.mjs';
import { SHAPES } from './src/climbs.mjs';
import { cachedFetch } from './src/ors-cache.mjs';

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
if (target.shape && !SHAPES.includes(target.shape)) {
  console.log(`Unknown --shape "${target.shape}". Use one of: ${SHAPES.join(', ')}`);
  process.exit(1);
}
console.log(`Target: ${target.distanceM / 1000} km, ${target.gainM} m climbing` +
  `${target.shape ? `, shape ${target.shape}` : ''}, from ${target.lat}, ${target.lon}`);
// Saved answers in .cache/ors make repeat searches free; --no-cache asks openrouteservice afresh.
const fetchImpl = 'no-cache' in args ? fetch : cachedFetch(fetch);
let result;
try {
  result = await findRoutes(target, {
    apiKey: process.env.ORS_API_KEY,
    fetchImpl,
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
mkdirSync('out', { recursive: true });
result.routes.forEach((r, i) => {
  const dPct = ((r.distanceM - target.distanceM) / target.distanceM) * 100;
  const gPct = ((r.gainM - target.gainM) / Math.max(target.gainM, 50)) * 100;
  const file = `out/route-${i + 1}.gpx`;
  writeFileSync(file, toGpx(r, `Route ${i + 1}`));
  console.log(`#${i + 1}  ${(r.distanceM / 1000).toFixed(1)} km (${dPct >= 0 ? '+' : ''}${dPct.toFixed(0)}%)  ` +
    `${r.gainM} m up (${gPct >= 0 ? '+' : ''}${gPct.toFixed(0)}%)  ` +
    `${r.shapePenalty != null ? `shape miss ${Math.round(r.shapePenalty)}  ` : ''}score ${r.score.toFixed(1)}  ` +
    `[${r.kind === 'heading' ? `heading ${r.heading} deg` : `random seed ${r.seed}`}]  -> ${file}`);
});

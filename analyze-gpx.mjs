#!/usr/bin/env node
// Usage: node analyze-gpx.mjs out/route-1.gpx [more.gpx ...]
// Lists the climbs in each route and how well it fits each climb shape. No API calls.
import { readFileSync } from 'node:fs';
import { routeLength, elevationGain } from './src/engine.mjs';
import { describeShape } from './src/climbs.mjs';
import { parseGpx } from './src/gpx.mjs';

const files = process.argv.slice(2);
if (!files.length) { console.log('Usage: node analyze-gpx.mjs <file.gpx> [...]'); process.exit(1); }
for (const file of files) {
  const coords = parseGpx(readFileSync(file, 'utf8'));
  const { climbs, penalties, bestFit } = describeShape(coords);
  console.log(`\n${file}: ${(routeLength(coords) / 1000).toFixed(1)} km, ${elevationGain(coords)} m up, ` +
    `${climbs.length} climb${climbs.length === 1 ? '' : 's'} -> looks like: ${bestFit}`);
  for (const c of climbs) {
    console.log(`   km ${(c.startM / 1000).toFixed(1)}-${(c.endM / 1000).toFixed(1)}: ` +
      `+${c.gainM} m over ${(c.lengthM / 1000).toFixed(1)} km (${(c.grade * 100).toFixed(1)}%)`);
  }
  console.log(`   shape penalty (0 = perfect): long ${penalties.long}, rolling ${penalties.rolling}, repeats ${penalties.repeats}`);
}

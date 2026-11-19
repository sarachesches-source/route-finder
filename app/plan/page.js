// The route planner (/plan). Runs on the server: reads the GPX files in out/ (made by
// find-routes.mjs) and hands them to the browser view, which also has the search form.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseGpx, gpxName } from '../../src/gpx.mjs';
import { summarizeRoute, attachWater } from '../../src/summary.mjs';
import { findWater } from '../../src/water-sources.mjs';
import RouteViewer from '../RouteViewer';

export const dynamic = 'force-dynamic'; // re-read out/ on every page load

export const metadata = { title: 'Plan your run · Hillgorithm' };

function loadRoutes() {
  const dir = path.join(process.cwd(), 'out');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.gpx'))
    .sort()
    .map((file) => {
      const xml = readFileSync(path.join(dir, file), 'utf8');
      return summarizeRoute(parseGpx(xml), { file, name: gpxName(xml) ?? file });
    })
    .filter((r) => r.coords.length > 1);
}

export default async function Home() {
  const routes = loadRoutes();
  // Saved files sit outside out/practice, so they're real routes: look up real water (cached a week).
  // Short time limit: a busy water server must not hold up the page.
  if (routes.length) {
    attachWater(routes, await findWater(routes.map((r) => r.coords), { apiKey: process.env.ORS_API_KEY, timeLimitMs: 5000 }));
  }
  return <RouteViewer savedRoutes={routes} />;
}

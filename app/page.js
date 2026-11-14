// Home page. Runs on the server: reads the GPX files in out/ (made by find-routes.mjs)
// and hands them to the browser view, which also has the search form.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseGpx, gpxName } from '../src/gpx.mjs';
import { summarizeRoute } from '../src/summary.mjs';
import RouteViewer from './RouteViewer';

export const dynamic = 'force-dynamic'; // re-read out/ on every page load

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

export default function Home() {
  return <RouteViewer savedRoutes={loadRoutes()} />;
}

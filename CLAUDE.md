# Running route app

AI route finder for trail and ultra runners: give a start point, a distance and a
climbing target, get three loops that hit both numbers. Inspired by trackscout.net.

## Decisions so far
- Audience: trail and ultra runners. Area: Europe. Goal: portfolio and learning (no payments).
- Signature features: exact vert targets with climb shaping, and race rehearsal
  (upload a race GPX, get a local route that mimics its climbs).
- The AI never draws routes. A routing engine generates candidate loops; code scores them.
- Routing: openrouteservice hosted API, `foot-hiking` profile, round-trip option.
  Key is in `.env` as `ORS_API_KEY` (gitignored).
- Owner is not a developer: explain choices in plain language, keep steps small.

## Build order
1. Route engine (done, live-tested; distance accurate, climbing limited by terrain) - `src/engine.mjs`
2. Climb shaping: score for one long climb, rolling hills, or hill repeats
   (scoring done, offline-tested - `src/climbs.mjs`, `--shape long|rolling|repeats`;
   not yet live-tested. Loops almost never contain repeats, so "repeats" needs its own
   route builder: find a good climb, then run up and down it N times.)
3. Web app: Next.js + MapLibre map, input form, elevation profile, GPX export
   (done, real searches not yet live-tested: search form - start by typing, map click or "use
   my location"; distance, climbing, shape - runs `findRoutes` on the server via `/api/find` so
   the key stays private. Results show % miss vs target. Map with Topo/Streets, elevation
   profile linked to the map, climb list, GPX download. Saved routes in `out/` show on load.
   Practice mode (dev only) uses `src/fake-ors.mjs`: invented terrain, no API quota.)
4. Race rehearsal: GPX upload, match climb pattern to local terrain
   (done, practice-tested only - `src/rehearsal.mjs`. Pattern = "climbing curve": share of total
   climb done at each 2% of distance; routes scored by mean gap between curves (0-100), each loop
   tried both ways round, result says clockwise/anticlockwise. Climbing target defaults to the
   race's m/km x training km. Web: upload box in the form; dashed race outline on the chart.
   CLI: `--race file.gpx`. Sample: `samples/sample-mountain-marathon.gpx` (made up).
   Limit: a 15 km loop from the city can't hold two 500 m+ climbs; expect "partial" matches.)
5. Chat input and saved routes

## Live test results (2026-11-14, central Cluj, 15 km / 500 m)
- First run (random round trips only): best 3 missed by 17-36% distance or 21-39% climbing.
  Distance overshot because ORS round trips come back longer than requested.
- Engine widened: 8 compass headings x 2 triangle shapes (narrow 25 deg, wide 60 deg) plus
  8 random round trips; each loop is re-requested up to twice with a scaled length; 429s retried.
- Result: distance now within 3% on all three. Climbing still short: best 322-372 m (-26 to -36%).
- Why: no loop got above ~570 m. The hills south of Cluj (Faget, ~700 m+) are ~6-7 km out,
  further than a 15 km loop reaches. Most climb is south/south-east (headings 135-202).
- Quota: one run is ~50 ORS requests. The free plan ran out ("403 Quota exceeded") after ~250
  requests in one day. Keep live runs few; don't loop experiments against the live API.
- Cache (2026-11-14): successful ORS answers are saved in `.cache/ors/` (gitignored, 30 days)
  by `src/ors-cache.mjs`. Repeating the same search costs 0 requests; CLI and web share it.
  Errors are never cached. `--no-cache` on the CLI forces fresh requests.

## Live test results (2026-11-15, forest edge 46.7420, 23.5870, 15 km)
GPX copies of each run are in `out/live-1-forest-edge/`, `out/live-2-shape-long/`, `out/live-3-race/`.
1. Plain, 500 m: PASS. 15.1 km/515 m (+1%/+3%), 15.7/505 (+5%/+1%), 14.7/480 (-2%/-4%). 55 requests.
   -> The engine works; yesterday's centre-start misses were the terrain.
2. `--shape long`: 0 new requests (all from cache). Picks real single-climb routes (one climb of
   302 m over 4.2 km) but gives up too much climbing: -16% to -26%. Shape weight 0.5 outweighs
   the climbing target. Fix idea: only let shape choose between routes already within ~10%.
3. `--race` sample marathon (target 660 m from 44 m/km): 0 new requests. Pattern miss 12-22
   (strong/partial), loops flipped where better, but climbing -19% to -23%: no loop here reaches
   660 m, and the terrain gives rolling hills, not two big climbs.
- Data glitch seen: a "+31 m over 0.0 km (84.8%)" climb in route 2 of run 3 - a spike in the
  elevation data.
- Fixed the same day (rerun from cache, 0 requests; GPX in `out/live-*-v2/`):
  - Ranking (`rankRoutes` in engine): distance + climbing accuracy first; only routes within
    10 points of the most accurate are "close enough", and shape / race pattern picks among those.
  - Spikes: `cleanElevation` replaces points > 8 m off the median of their neighbours
    (applied to ORS routes and uploaded races).
  - After: plain 504/480/527 m (+1/-4/+5%). Shape long: climbing now +1/-10/-4%, but shape miss
    47-65 - there is no 500 m single-climb loop here, and the app now says so instead of hiding
    it by dropping climbing. Race: still -20 to -27% because nothing here reaches 660 m;
    pattern picks among the closest.

## Next task
Features from the 2026-11-15 research into what other apps miss, best first:
1. Trail % and surface breakdown per route (ORS `extra_info`: surface, waytype, steepness),
   and score mostly-trail routes higher. Same requests, no extra quota (cache keys change once).
2. Drinking water along the route (OpenStreetMap via Overpass) and bail-out info
   ("at km 9 you're 2.1 km from the start").
3. "Why this route" breakdown and steep-section warnings on each card.
4. Race rehearsal: also match descents and steepness, not just where the climbing comes.
5. Later: prefer paths the runner hasn't run yet (upload past runs).
Still to do: one real search from the web form (practice mode off) - should come from cache.

## Web app notes
- Code in `app/` (Next.js 16, plain JavaScript): `page.js` reads `out/` on the server,
  `RouteViewer.js` is the screen, `SearchForm.js` the form, `MapView.js` the map,
  `ElevationProfile.js` the chart, `api/find/route.js` the search endpoint.
- In dev, the map is `window.__map` in the browser console (handy for debugging).
- Map tiles are free, no key: OpenTopoMap (topo) and OpenFreeMap (streets). Credits must stay visible.
- MapLibre 6 needs its worker file served from `public/`; `npm install` copies it there
  (`scripts/copy-map-worker.mjs`). If the map is blank, run `node scripts/copy-map-worker.mjs`.

## Git
- Repo in this folder, branch `main`, no remote (local only). First commit 2026-11-14.
- `.env` (API key), `out/`, `node_modules/`, `.next/` are ignored - never commit the key.
- Commit after each working step, with a plain-language message.

## Commands
- Web app: `npm run dev` then open http://localhost:3000 (shows the GPX files in `out/`)
- Tests: `npm test` (engine, climbs, cache, rehearsal)
- Analyze a GPX (no API calls): `node analyze-gpx.mjs out/route-1.gpx` - lists climbs and shape fit
- Find routes: `node find-routes.mjs --lat <lat> --lon <lon> --km <km> --vert <m>` (GPX files go to `out/`)
  Optional: `--headings 8 --candidates 8` (compass directions / random round trips),
  `--shape long|rolling|repeats` (prefer that climb profile), `--race file.gpx` (copy a race's
  climb pattern), `--practice` (made-up routes, no API use; writes to `out/practice/`)

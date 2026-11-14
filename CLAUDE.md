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

## Next task
When the ORS quota resets, run the forest-edge test to tell "terrain can't do it" from
"engine can't find it":

    node find-routes.mjs --lat 46.7420 --lon 23.5870 --km 15 --vert 500

- If that hits ~10% on both: engine is fine; the centre start just lacks hills. Then show the
  user the best achievable climb instead of pretending, and move on to climb shaping (step 2),
  where hill repeats can add vert on a short hill.
- If it still misses badly: try loops that reach further (out-and-back "lollipop" shapes).
- Same session, one extra run to check climb shaping live:
  `node find-routes.mjs --lat 46.7420 --lon 23.5870 --km 15 --vert 500 --shape long`

Offline work that needs no API quota: hill-repeats route builder (see step 2).
When quota is back, also run one real search from the web form (practice mode off).

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
- Tests: `npm test`
- Analyze a GPX (no API calls): `node analyze-gpx.mjs out/route-1.gpx` - lists climbs and shape fit
- Find routes: `node find-routes.mjs --lat <lat> --lon <lon> --km <km> --vert <m>` (GPX files go to `out/`)
  Optional: `--headings 8 --candidates 8` (compass directions / random round trips),
  `--shape long|rolling|repeats` (prefer that climb profile)

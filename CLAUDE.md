# Hillgorithm (running route app)

Name chosen 2026-11-15: **Hillgorithm**, tagline "Loops built to your climb" (clear of existing
running apps; hillgorithm .com/.app/.run/.io had no DNS then - not bought). GitHub repo is still
`route-finder` (private): github.com/sarachesches-source/route-finder.

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
1. DONE 2026-11-15: trail % and surface breakdown (`src/surface.mjs`, ORS `extra_info`
   surface + waytype). Groups: trail (dirt/ground/grass/sand/unpaved, or path/track with no
   surface tag), gravel, paved, unknown; plus % on roads/streets. Among close-enough routes,
   more trail wins (`trailWeight` 0.15 -> up to 15 points). Shown as a bar on web cards and a
   line in the CLI. Live forest edge: 41-54% trail, 15-23% unknown (untagged in OSM).
   Map colouring DONE 2026-11-15: "Route | Surface" toggle on the map (only when the route has
   surface data, so not for saved GPX files). Selected route drawn per stretch: trail brown,
   gravel tan, paved grey, unknown dashed; legend with percentages. Colours live in
   `SURFACE_COLORS` (src/surface.mjs) and match the card bars (globals.css).
2. DONE 2026-11-15: water + bail-out.
   - Bail-out (`src/bailout.mjs`, no network): farthest point from start, straight-line
     distance back every 1-5 km, and "shortcut" spots mid-run (25-75%) within 1 km of start.
   - Water (`src/water.mjs` pure, `src/water-sources.mjs` fetch): drinking fountains, water
     points, springs within 150 m of each route. Source 1: openrouteservice POIs (same key,
     categories 166/565 fountain, 182 water point, 338 spring), one request per route, cached
     7 days in `.cache/ors-pois/`. Source 2 fallback: Overpass (`src/overpass.mjs`, two public
     servers) - on 2026-11-15 both were too busy to answer, so don't rely on it.
     12 s limit for searches, 5 s for page load; failure shows "couldn't load", never an error.
     Springs / water points are marked "check it's drinkable".
   - UI: "Water & bail-out" section, blue ticks on the elevation chart, blue dots on the map;
     click a water stop to zoom to it. Practice mode invents a fountain every ~4 km.
   - Live forest edge: spring "Izvorul Hóvirág" km 6.4 on route 1, fountain km 4.3 on route 3,
     none on route 2 (14.7 km dry).
   - Not yet: way back by real paths (needs an ORS request), nearest road for pickup.
3. DONE 2026-11-15: "Why this route" card (`src/explain.mjs`, shown for the selected route).
   Rank sentence ("Closest of all..." / "Nearly as close... N points behind, with more trail" /
   "shown as an alternative"), ✓/✗ for distance, climbing, shape, race pattern, trail share,
   warnings (steepest 200 m climb or descent >= 20%, >= 25% on roads, >= 30% unknown surface,
   no water on 10 km+, 10 km+ dry stretch) and notes (steepest climb, shortcut, water stops).
   API now also sends accuracy / extra / closeEnough per result.
   Live forest edge route 1: steep climb 22% at km 8.4, steep descent 21% at km 6.7.
4. DONE 2026-11-15: race rehearsal matches descents and steepness too (`src/rehearsal.mjs`).
   Pattern = { climb curve, descent curve, steepness mix (7 grade bands over 100 m pieces) };
   `matchRace` scores each part 0-100 and mixes them 45% climbs / 25% descents / 30% steepness.
   Web: race box shows the race's steepness; "Why this route" shows each part and compares
   steep share ("race 34% steep, this route 20%"). CLI prints the three parts.
   Live (from cache): descent part separated routes (33 / 55 / 20); the most accurate route
   on climbing dropped to #2 because its descents don't match.
5. Later: prefer paths the runner hasn't run yet (upload past runs).
Web form real search checked 2026-11-15: 0 new requests, 55 from saved answers.

## Landing page (2026-11-19)
- `/` = landing page (`app/page.js`, `app/landing.css`), `/plan` = the route planner (was `/`).
- Psychology: clarity first (hero A "Tell us the distance and the climb. Get the loop."), show real
  results (animated loop + real numbers, real screenshots in `public/landing/`), main button
  "Try it free" with "No account needed", runners' language, honest trust points, no fake reviews.
- Sections: hero, 3 steps, what you get (4 outcomes), real results, trust, accounts, FAQ, final CTA.
- Sign-in is an honest "Accounts coming soon" section (nav "Sign in" scrolls to it). Real accounts
  (Google + email link, saved routes, more searches) not built - owner hasn't decided yet.
- The planner logo links back to `/`. Link previews use `metadataBase` (SITE_URL or the vercel URL).

## Web app notes
- Design (2026-11-15 redesign): Inter font (next/font), forest-green primary, warm neutrals, cards;
  tokens at the top of `app/globals.css` (light + dark). Icons are inline SVGs in `app/icons.js`.
  Layout: brand bar, "Plan your run" card (less-used options under "More options"), result cards
  (big numbers, miss pills, Best match badge), details card with elevation chart + tabs
  (Overview / Climbs / Water & exits). Screenshots for the README are taken in light mode.
- Code in `app/` (Next.js 16, plain JavaScript): `page.js` reads `out/` on the server,
  `RouteViewer.js` is the screen, `SearchForm.js` the form, `MapView.js` the map,
  `ElevationProfile.js` the chart, `api/find/route.js` the search endpoint.
- In dev, the map is `window.__map` in the browser console (handy for debugging).
- Map tiles are free, no key: OpenTopoMap (topo) and OpenFreeMap (streets). Credits must stay visible.
- MapLibre 6 needs its worker file served from `public/`; `npm install` copies it there
  (`scripts/copy-map-worker.mjs`). If the map is blank, run `node scripts/copy-map-worker.mjs`.

## Online (live since 2026-11-15): https://hillgorithm.vercel.app/
- Deployed by the owner on Vercel from the GitHub repo (main branch; each push redeploys).
  ORS_API_KEY is set in Vercel. Checked live: example loads, race example, surface colours,
  tabs, input checks, no console errors.
- First live searches failed: ORS_API_KEY wasn't picked up until the variable was saved for
  Production and the site redeployed (new Vercel UI: Settings -> Environments -> Production).
- Live search verified 2026-11-19: forest edge 15 km / 500 m -> 95 s, 55 requests, same 3 routes
  as locally (15.1/504, 14.7/480, 14.3/527), water loaded. Repeat: 0 s, 55 from cache, 0 new.
  Each push redeploys and clears that temp cache.

## Going online - how it was prepared
- `next build` passes. Production-only behaviour: practice mode hidden/ignored, search limits on.
- Limits (`src/limits.mjs`): SEARCHES_PER_HOUR (5/visitor/hour, visitor = hashed IP) and
  DAILY_REQUEST_BUDGET (1500 ORS requests/day, cache hits don't count). In memory; off in dev
  unless set. Tested with a temporary limit of 2: third search got the friendly 429.
- Cache folder: `cacheDir()` in `src/ors-cache.mjs` - CACHE_DIR, else temp folder on Vercel, else .cache.
- Example searches: `public/examples/*.json` (forest edge, race rehearsal), made by
  `node scripts/make-examples.mjs` from cache. Auto-load when there are no saved routes
  (which is the case online, since out/ isn't deployed). "Examples" chips under the form.
- `src/search.mjs` = one full search (engine + summary + water), shared by API and script.
- Next step needs the owner: create a GitHub repo + Vercel account, add ORS_API_KEY in Vercel.
  Never push or deploy without being asked. Check the host's function time limit (~2 min searches).

## Git
- Repo in this folder, branch `main`, no remote (local only). First commit 2026-11-14.
- `.env` (API key), `out/`, `node_modules/`, `.next/` are ignored - never commit the key.
- Commit after each working step, with a plain-language message.

## Commands
- `README.md` is the portfolio-facing overview (screenshots in `docs/screenshots/`, taken at 1280x800
  from a cached forest-edge search). Update it when features change. `.env.example` shows the setting.
- Web app: `npm run dev` then open http://localhost:3000 (shows the GPX files in `out/`)
- Tests: `npm test` (engine, climbs, cache, rehearsal, surface, water, explain)
- Analyze a GPX (no API calls): `node analyze-gpx.mjs out/route-1.gpx` - lists climbs and shape fit
- Find routes: `node find-routes.mjs --lat <lat> --lon <lon> --km <km> --vert <m>` (GPX files go to `out/`)
  Optional: `--headings 8 --candidates 8` (compass directions / random round trips),
  `--shape long|rolling|repeats` (prefer that climb profile), `--race file.gpx` (copy a race's
  climb pattern), `--practice` (made-up routes, no API use; writes to `out/practice/`)

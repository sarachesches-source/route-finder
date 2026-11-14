'use client';
// The whole screen: search form, route list, elevation profile and climbs on the left, map on the right.
import { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import ElevationProfile from './ElevationProfile';
import SearchForm from './SearchForm';
import { toGpx } from '../src/engine.mjs';

// The map library needs a real browser, so it's only loaded there.
const MapView = dynamic(() => import('./MapView'), { ssr: false });

export const ROUTE_COLORS = ['#d9622b', '#2a7ab0', '#6b8e23', '#8e44ad', '#c0392b', '#16a085'];
const DEFAULT_START = { lat: 46.7712, lon: 23.6236 }; // central Cluj-Napoca

const SHAPE_WORDS = { long: 'one long climb', rolling: 'rolling hills', repeats: 'hill repeats', flat: 'flat' };
function fitWord(penalty) {
  if (penalty <= 15) return 'strong';
  if (penalty <= 40) return 'partial';
  return 'weak';
}

function download(route) {
  const blob = new Blob([toGpx(route, route.name)], { type: 'application/gpx+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = route.file;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** "+3%" in green when within 10% of the target, otherwise in the warning colour. */
function Miss({ value, target, floor = 1 }) {
  const pct = Math.round(((value - target) / Math.max(target, floor)) * 100);
  return <span className={Math.abs(pct) <= 10 ? 'good' : 'off'}>{pct > 0 ? '+' : pct < 0 ? '−' : ''}{Math.abs(pct)}%</span>;
}

export default function RouteViewer({ savedRoutes }) {
  const [routes, setRoutes] = useState(savedRoutes);
  const [target, setTarget] = useState(null); // set once a search has run
  const [practice, setPractice] = useState(false);
  const [race, setRace] = useState(null); // uploaded race to rehearse (summary from rehearsal.mjs)
  const [requests, setRequests] = useState(null); // { misses, hits } from the last real search
  const [selected, setSelected] = useState(0);
  const [hoverIdx, setHoverIdx] = useState(null);
  const [activeClimb, setActiveClimb] = useState(null);
  const [mapStyle, setMapStyle] = useState('topo');
  const [start, setStart] = useState(() =>
    savedRoutes[0] ? { lon: savedRoutes[0].coords[0][0], lat: savedRoutes[0].coords[0][1] } : DEFAULT_START);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);

  const pick = useCallback((i) => { setSelected(i); setActiveClimb(null); setHoverIdx(null); }, []);

  async function search(params) {
    setSearching(true); setError(null);
    try {
      const res = await fetch('/api/find', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params),
      });
      const data = await res.json().catch(() => ({ error: `Server error ${res.status}` }));
      if (!res.ok) throw new Error(data.error);
      setRoutes(data.routes);
      setTarget({ distanceM: params.km * 1000, gainM: params.vert, shape: params.shape, race: params.race ? race : null });
      setPractice(data.practice);
      setRequests(data.requests);
      pick(0);
    } catch (e) {
      setError(e.message || 'Search failed.');
    } finally {
      setSearching(false);
    }
  }

  function showSaved() { setRoutes(savedRoutes); setTarget(null); setPractice(false); setRequests(null); pick(0); }

  const route = routes[selected];
  const climb = route && activeClimb != null ? route.climbs[activeClimb] : null;

  return (
    <div className="app">
      <aside className="panel">
        <header>
          <h1>Route finder</h1>
          <p className="sub">Loops that hit your distance and climbing.</p>
        </header>

        <SearchForm start={start} onStartChange={setStart} onSearch={search} searching={searching} error={error}
          race={race} onRaceChange={setRace} />

        <section>
          <div className="section-head">
            <h2>
              {target
                ? `${practice ? 'Practice ' : ''}${target.race ? `rehearsal of ${target.race.name}` : 'results'} · ${target.distanceM / 1000} km, ${target.gainM} m`
                : `Saved routes (${routes.length})`}
            </h2>
            {target && savedRoutes.length > 0 && <button className="link" onClick={showSaved}>Saved routes</button>}
          </div>
          {requests && (
            <p className="hint">
              Used {requests.misses} openrouteservice request{requests.misses === 1 ? '' : 's'}
              {requests.hits > 0 && ` · ${requests.hits} answered from saved results`}
            </p>
          )}
          {routes.length ? (
            <div className="cards">
              {routes.map((r, i) => (
                <button key={`${r.file}-${i}`} className="card" aria-pressed={i === selected} onClick={() => pick(i)}>
                  <span className="dot" style={{ background: ROUTE_COLORS[i % ROUTE_COLORS.length] }} />
                  <span className="title">{r.name}</span>
                  <span className="stats">
                    <strong>{(r.distanceM / 1000).toFixed(1)} km</strong>
                    {target && <> (<Miss value={r.distanceM} target={target.distanceM} />)</>}
                    {' · '}<strong>{r.gainM} m</strong> up
                    {target && <> (<Miss value={r.gainM} target={target.gainM} floor={50} />)</>}
                  </span>
                  <span className="fit">
                    {r.climbs.length} climb{r.climbs.length === 1 ? '' : 's'} · looks like {SHAPE_WORDS[r.bestFit]}
                    {r.bestFit !== 'flat' && ` (${fitWord(r.penalties[r.bestFit])})`}
                  </span>
                  {r.patternPenalty != null && (
                    <span className="fit">
                      Race pattern: <strong>{fitWord(r.patternPenalty)} match</strong>
                      {r.direction && ` · run it ${r.direction}`}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">No routes yet. Set a start point and press Find routes.</p>
          )}
        </section>

        {route && (
          <>
            <section>
              <h2>Elevation</h2>
              <ElevationProfile
                route={route}
                color={ROUTE_COLORS[selected % ROUTE_COLORS.length]}
                hoverIdx={hoverIdx}
                onHover={setHoverIdx}
                activeClimb={climb}
                ghost={target?.race && route.patternPenalty != null ? target.race.profile : null}
              />
            </section>

            <section>
              <h2>Climbs</h2>
              {route.climbs.length ? (
                <ul className="climbs">
                  {route.climbs.map((c, i) => (
                    <li key={i}>
                      <button aria-pressed={i === activeClimb} onClick={() => setActiveClimb(i === activeClimb ? null : i)}>
                        <span>km {(c.startM / 1000).toFixed(1)}–{(c.endM / 1000).toFixed(1)}</span>
                        <span><strong>+{c.gainM} m</strong> <span className="muted">{(c.grade * 100).toFixed(1)}%</span></span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="muted">No climbs over 30 m.</p>}
            </section>

            <button className="download" onClick={() => download(route)}>Download GPX</button>
          </>
        )}
      </aside>

      <main className="map-wrap">
        <div className="style-toggle" role="group" aria-label="Map style">
          <button aria-pressed={mapStyle === 'topo'} onClick={() => setMapStyle('topo')}>Topo</button>
          <button aria-pressed={mapStyle === 'streets'} onClick={() => setMapStyle('streets')}>Streets</button>
        </div>
        <MapView
          routes={routes}
          selected={selected}
          colors={ROUTE_COLORS}
          hoverPoint={route && hoverIdx != null ? route.coords[hoverIdx] : null}
          focus={climb ? sliceByDistance(route, climb.startM, climb.endM) : null}
          mapStyle={mapStyle}
          start={start}
          onSelect={pick}
          onPickStart={searching ? null : setStart}
        />
      </main>
    </div>
  );
}

function sliceByDistance(route, fromM, toM) {
  return route.coords.filter((_, i) => route.along[i] >= fromM && route.along[i] <= toM);
}

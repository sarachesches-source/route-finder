'use client';
// The whole screen: brand bar, "Plan your run" form, results and route details on the left,
// map on the right (on phones: map on top).
import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import ElevationProfile from './ElevationProfile';
import SearchForm from './SearchForm';
import { SURFACE_GROUPS } from '../src/surface.mjs';
import { explainRoute } from '../src/explain.mjs';
import { toGpx } from '../src/engine.mjs';
import { defaultUnits, dist, elev, at, distValue, elevValue, distUnit, elevUnit } from '../src/units.mjs';
import {
  LogoIcon, MountainIcon, DropIcon, DownloadIcon, AlertIcon, CheckIcon, CrossIcon, PinIcon, HomeIcon, FlagIcon,
} from './icons';

// The map library needs a real browser, so it's only loaded there.
const MapView = dynamic(() => import('./MapView'), { ssr: false });

export const ROUTE_COLORS = ['#d9622b', '#2a7ab0', '#7a9a2e', '#8e44ad', '#c0392b', '#16a085'];
const DEFAULT_START = { lat: 46.7712, lon: 23.6236 }; // central Cluj-Napoca

// Ready-made searches in public/examples (made by scripts/make-examples.mjs from real results).
const EXAMPLES = [
  { id: 'forest-edge', label: '15 km · 500 m near Cluj' },
  { id: 'race-rehearsal', label: 'Mountain marathon rehearsal' },
  { id: 'boulder', label: '10 mi · 2,000 ft in Boulder, CO' },
];

const SHAPE_WORDS = { long: 'One long climb', rolling: 'Rolling hills', repeats: 'Hill repeats', flat: 'Flat' };
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

/** "+3%" pill: green within 10% of the target, amber otherwise. */
function Miss({ value, target, floor = 1 }) {
  const pct = Math.round(((value - target) / Math.max(target, floor)) * 100);
  const text = `${pct > 0 ? '+' : pct < 0 ? '−' : '±'}${Math.abs(pct)}%`;
  return <span className={`pill ${Math.abs(pct) <= 10 ? 'good' : 'off'}`} title="Difference from your target">{text}</span>;
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
  const [waterFocus, setWaterFocus] = useState(null); // [lon, lat] of a water stop picked in the list
  const [tab, setTab] = useState('overview');
  const [mapStyle, setMapStyle] = useState('topo');
  const [colorBy, setColorBy] = useState('route'); // selected route: its own colour or by surface
  const [start, setStart] = useState(() =>
    savedRoutes[0] ? { lon: savedRoutes[0].coords[0][0], lat: savedRoutes[0].coords[0][1] } : DEFAULT_START);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);
  const [exampleTitle, setExampleTitle] = useState(null); // set while an example is shown
  // Display units: the viewer's last choice, else from their browser (US -> miles and feet).
  const [units, setUnitsState] = useState('metric');
  useEffect(() => {
    let saved = null;
    try { saved = localStorage.getItem('hillgorithm-units'); } catch { /* storage blocked */ }
    setUnitsState(saved === 'metric' || saved === 'imperial' ? saved : defaultUnits(navigator.language));
  }, []);
  const setUnits = (u) => {
    setUnitsState(u);
    try { localStorage.setItem('hillgorithm-units', u); } catch { /* storage blocked */ }
  };

  const pick = useCallback((i) => { setSelected(i); setActiveClimb(null); setHoverIdx(null); setWaterFocus(null); }, []);

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
      setExampleTitle(null);
      setTab('overview');
      pick(0);
    } catch (e) {
      setError(e.message || 'Search failed.');
    } finally {
      setSearching(false);
    }
  }

  function showSaved() { setRoutes(savedRoutes); setTarget(null); setPractice(false); setRequests(null); setExampleTitle(null); pick(0); }

  async function loadExample(id) {
    setError(null);
    try {
      const res = await fetch(`/examples/${id}.json`);
      if (!res.ok) throw new Error('Example not found.');
      const ex = await res.json();
      setRoutes(ex.routes);
      setTarget(ex.target);
      setStart(ex.start);
      setPractice(false);
      setRequests(null);
      setExampleTitle(ex.title);
      setTab('overview');
      pick(0);
    } catch (e) {
      setError(`Couldn't load the example: ${e.message}`);
    }
  }

  // Nothing saved yet (as on the public site): open with a real example instead of an empty map.
  useEffect(() => {
    if (!savedRoutes.length) loadExample('forest-edge');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const route = routes[selected];
  const climb = route && activeClimb != null ? route.climbs[activeClimb] : null;
  const color = (i) => ROUTE_COLORS[i % ROUTE_COLORS.length];

  const heading = exampleTitle ? `Example: ${exampleTitle}` : target
    ? (target.race ? `Rehearsal of ${target.race.name}` : `${routes.length} route${routes.length === 1 ? '' : 's'} found`)
    : 'Saved routes';

  return (
    <div className="app">
      <aside className="panel">
        <header className="brand">
          <a href="/" className="brand-link" aria-label="Hillgorithm home page">
            <span className="brand-mark"><LogoIcon size={20} /></span>
            <div>
              <h1>Hillgorithm</h1>
              <p>Loops built to your climb</p>
            </div>
          </a>
          <div className="units-toggle" role="group" aria-label="Units">
            <button aria-pressed={units === 'metric'} onClick={() => setUnits('metric')} title="Kilometres and metres">km</button>
            <button aria-pressed={units === 'imperial'} onClick={() => setUnits('imperial')} title="Miles and feet">mi</button>
          </div>
        </header>

        <div className="panel-scroll">
          <SearchForm start={start} onStartChange={setStart} onSearch={search} searching={searching} error={error}
            race={race} onRaceChange={setRace} units={units} />

          <div className="examples" aria-label="Example searches">
            <span>Examples</span>
            {EXAMPLES.map((ex) => (
              <button key={ex.id} className="chip-btn" onClick={() => loadExample(ex.id)}>{ex.label}</button>
            ))}
          </div>

          <section aria-label="Routes">
            <div className="section-head">
              <h2>{practice && <span className="badge" style={{ marginRight: 6 }}>Practice</span>}{heading}</h2>
              {(target || exampleTitle) && savedRoutes.length > 0 && <button className="link" onClick={showSaved}>Saved routes</button>}
            </div>
            {target && (
              <p className="section-meta">
                Target {dist(target.distanceM, units, units === 'imperial' ? 1 : 0)} · {elev(target.gainM, units)} climbing
                {requests && ` · ${requests.misses} new request${requests.misses === 1 ? '' : 's'}${requests.hits ? `, ${requests.hits} from saved answers` : ''}`}
              </p>
            )}
            {routes.length ? (
              <div className="results">
                {routes.map((r, i) => (
                  <ResultCard key={`${r.file}-${i}`} route={r} index={i} target={target}
                    selected={i === selected} color={color(i)} onPick={() => pick(i)} units={units} />
                ))}
              </div>
            ) : (
              <div className="empty">
                <div className="empty-icon"><PinIcon size={22} /></div>
                <strong>No routes yet</strong>
                Set a start point and press Find routes.
              </div>
            )}
          </section>

          {route && (
            <section className="card details" aria-label="Route details">
              <div className="details-head">
                <h2><span className="dot" style={{ background: color(selected) }} />{route.name}</h2>
                <button className="btn btn-secondary btn-sm" onClick={() => download(route)}>
                  <DownloadIcon size={15} /> GPX
                </button>
              </div>
              <div className="details-body">
                <ElevationProfile
                  route={route}
                  color={color(selected)}
                  hoverIdx={hoverIdx}
                  onHover={setHoverIdx}
                  activeClimb={climb}
                  ghost={target?.race && route.patternPenalty != null ? target.race.profile : null}
                  water={route.water?.stops}
                  units={units}
                />
                <div className="tabs" role="tablist" aria-label="Route details">
                  {[
                    ['overview', 'Overview'],
                    ['climbs', <>Climbs<span className="count">{route.climbs.length}</span></>],
                    ['water', <>Water &amp; exits{route.water?.stops?.length ? <span className="count">{route.water.stops.length}</span> : null}</>],
                  ].map(([id, label]) => (
                    <button key={id} role="tab" className="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
                  ))}
                </div>
                {tab === 'overview' && <WhyThisRoute route={route} target={target} routes={routes} units={units} />}
                {tab === 'climbs' && (
                  route.climbs.length ? (
                    <ul className="list">
                      {route.climbs.map((c, i) => (
                        <li key={i}>
                          <button aria-pressed={i === activeClimb} onClick={() => setActiveClimb(i === activeClimb ? null : i)}>
                            <span className="primary-text">
                              <span className="icon-chip climb"><MountainIcon size={14} /></span>
                              {at(c.startM, units)} – {distValue(c.endM, units).toFixed(1)}
                            </span>
                            <span className="secondary-text"><strong className="grade">+{elev(c.gainM, units)}</strong> · {(c.grade * 100).toFixed(1)}%</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="hint">No climbs over {elev(30, units)}.</p>
                )}
                {tab === 'water' && (
                  <WaterAndBailout route={route} units={units} onPickWater={(s) => { setActiveClimb(null); setWaterFocus([s.lon, s.lat]); }} />
                )}
              </div>
            </section>
          )}
        </div>
      </aside>

      <main className="map-wrap">
        <div className="map-controls">
          <div className="segmented" role="group" aria-label="Map style">
            <button aria-pressed={mapStyle === 'topo'} onClick={() => setMapStyle('topo')}>Topo</button>
            <button aria-pressed={mapStyle === 'streets'} onClick={() => setMapStyle('streets')}>Streets</button>
          </div>
          {route?.surface && (
            <div className="segmented" role="group" aria-label="Route colour">
              <button aria-pressed={colorBy === 'route'} onClick={() => setColorBy('route')}>Route</button>
              <button aria-pressed={colorBy === 'surface'} onClick={() => setColorBy('surface')}>Surface</button>
            </div>
          )}
        </div>
        {route?.surface && colorBy === 'surface' && (
          <div className="map-legend" aria-label="Surface colours">
            <strong>Surface</strong>
            {SURFACE_GROUPS.filter((g) => route.surface[g] >= 1).map((g) => (
              <span key={g}><span className={`legend-line ${g}`} />{g}<em>{route.surface[g]}%</em></span>
            ))}
          </div>
        )}
        {!routes.length && <div className="map-hint">Click the map to set your start point</div>}
        <MapView
          routes={routes}
          selected={selected}
          colors={ROUTE_COLORS}
          hoverPoint={route && hoverIdx != null ? route.coords[hoverIdx] : null}
          focus={climb ? sliceByDistance(route, climb.startM, climb.endM) : waterFocus ? [waterFocus, waterFocus] : null}
          mapStyle={mapStyle}
          start={start}
          onSelect={pick}
          onPickStart={searching ? null : setStart}
          colorBy={route?.surface ? colorBy : 'route'}
        />
      </main>
    </div>
  );
}

/** One result in the list: name, big distance and climbing numbers, misses, surface, short facts. */
function ResultCard({ route: r, index, target, selected, color, onPick, units }) {
  const best = target && index === 0;
  return (
    <button className="result" aria-pressed={selected} onClick={onPick} style={{ '--route-color': color }}>
      <span className="result-top">
        <span className="result-name">{r.name}</span>
        {best && <span className="badge"><CheckIcon size={12} /> Best match</span>}
        {r.patternPenalty != null && !best && <span className="badge">Race: {fitWord(r.patternPenalty)}</span>}
      </span>
      <span className="stats">
        <span className="stat">
          <span className="stat-value">{distValue(r.distanceM, units).toFixed(1)}</span><span className="stat-unit">{distUnit(units)}</span>
          {target && <Miss value={r.distanceM} target={target.distanceM} />}
        </span>
        <span className="stat">
          <span className="stat-value">{Math.round(elevValue(r.gainM, units)).toLocaleString('en-US')}</span><span className="stat-unit">{elevUnit(units)} up</span>
          {target && <Miss value={r.gainM} target={target.gainM} floor={50} />}
        </span>
      </span>
      {r.surface && <SurfaceBar surface={r.surface} />}
      <span className="result-meta">
        <span><MountainIcon size={13} /> {SHAPE_WORDS[r.bestFit]}</span>
        {r.water?.stops && <span><DropIcon size={13} /> {r.water.stops.length ? `${r.water.stops.length} water stop${r.water.stops.length > 1 ? 's' : ''}` : 'No water'}</span>}
        {r.patternPenalty != null && best && <span><FlagIcon size={13} /> Race pattern {fitWord(r.patternPenalty)}</span>}
        {r.direction && <span>Run {r.direction}</span>}
      </span>
    </button>
  );
}


/** Plain-language ranking reasons and warnings for the selected route. */
function WhyThisRoute({ route, target, routes, units }) {
  const { rankNote, reasons, warnings, notes } = explainRoute(route, target, routes, { units });
  return (
    <div className="why">
      {rankNote && <p className="rank-note">{rankNote}</p>}
      {reasons.length > 0 && (
        <ul className="reasons">
          {reasons.map((r) => (
            <li key={r.label} className={`${r.good === true ? 'pro' : r.good === false ? 'con' : ''}${r.sub ? ' sub' : ''}`}>
              <span className="mark" aria-hidden="true">
                {r.good === true ? <CheckIcon size={11} strokeWidth={3} /> : r.good === false ? <CrossIcon size={10} strokeWidth={3} /> : '•'}
              </span>
              <span className="label">{r.label}</span>
              <span>{r.value}</span>
            </li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <ul className="warnings">
          {warnings.map((w) => <li key={w}><AlertIcon size={15} /> <span>{w}</span></li>)}
        </ul>
      )}
      {notes.length > 0 && <p className="hint">{notes.join(' ')}</p>}
      {!target && <p className="hint">Run a search to see how this route compares with your targets.</p>}
    </div>
  );
}

/** Water stops along the route, how far from the start you get, and places to cut it short. */
function WaterAndBailout({ route, onPickWater, units }) {
  const { water, bailout } = route;
  return (
    <div className="wb">
      <div>
        <p className="subhead">Water</p>
        {water == null ? (
          <p className="hint">Couldn’t load water points right now. Try again later.</p>
        ) : water.stops.length ? (
          <>
            <ul className="list">
              {water.stops.map((s, i) => (
                <li key={i}>
                  <button onClick={() => onPickWater(s)}>
                    <span className="primary-text">
                      <span className="icon-chip water"><DropIcon size={14} /></span>
                      <span>{at(s.km * 1000, units)} · {s.kind}{s.name ? ` (${s.name})` : ''}</span>
                    </span>
                    <span className="secondary-text">{elev(s.offM, units)} off{s.checkFirst ? <><br />filter or treat before drinking</> : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="hint" style={{ marginTop: 6 }}>Longest stretch without water: {dist(water.longestDryKm * 1000, units)}.</p>
          </>
        ) : (
          <p className="callout"><DropIcon /> No mapped water within {elev(150, units)} of this route. Carry what you need.</p>
        )}
      </div>
      {bailout && (
        <div>
          <p className="subhead">Bail-out</p>
          <p className="callout"><HomeIcon /> <span>Farthest from the start: <strong>{dist(bailout.farthest.backM, units)}</strong> away, at {at(bailout.farthest.km * 1000, units)}.</span></p>
          {bailout.shortcuts.map((s, i) => (
            <p key={i} className="callout"><PinIcon /> <span>Cut it short at <strong>{at(s.km * 1000, units)}</strong>: you pass {dist(s.backM, units)} from the start.</span></p>
          ))}
          <div className="checkpoints">
            {bailout.checkpoints.map((c) => (
              <span key={c.km} className="chip">{units === 'imperial' ? at(c.km * 1000, units) : `km ${c.km.toFixed(0)}`} · {dist(c.backM, units)} back</span>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 8 }}>Distances back are in a straight line; the real way back is longer.</p>
        </div>
      )}
    </div>
  );
}

/** Coloured bar plus "53% trail · 2% gravel · 21% paved". */
function SurfaceBar({ surface }) {
  const shown = SURFACE_GROUPS.filter((g) => surface[g] >= 1);
  return (
    <span className="surface">
      <span className="surface-bar" aria-hidden="true">
        {shown.map((g) => <span key={g} className={`seg ${g}`} style={{ width: `${surface[g]}%` }} />)}
      </span>
      <span className="surface-text">
        {shown.map((g) => <span key={g}><span className={`swatch ${g}`} />{surface[g]}% {g}</span>)}
        {surface.road > 0 && <span>{surface.road}% on roads</span>}
      </span>
    </span>
  );
}

function sliceByDistance(route, fromM, toM) {
  return route.coords.filter((_, i) => route.along[i] >= fromM && route.along[i] <= toM);
}

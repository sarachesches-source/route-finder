'use client';
// Start point, distance, climbing, climb shape and optional race to rehearse.
// Clicking the map also sets the start.
import { useEffect, useState } from 'react';
import { parseGpx, gpxName } from '../src/gpx.mjs';
import { summarizeRace, rehearsalGain } from '../src/rehearsal.mjs';

const IS_DEV = process.env.NODE_ENV !== 'production';

export default function SearchForm({ start, onStartChange, onSearch, searching, error, race, onRaceChange }) {
  const [km, setKm] = useState('15');
  const [vert, setVert] = useState('500');
  const [shape, setShape] = useState('');
  const [practice, setPractice] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const [raceError, setRaceError] = useState(null);
  const [vertTouched, setVertTouched] = useState(false); // user typed their own climbing target
  // Text in the start boxes, kept separately so typing "46." isn't reformatted mid-keystroke.
  const [latText, setLatText] = useState(start.lat.toFixed(5));
  const [lonText, setLonText] = useState(start.lon.toFixed(5));
  useEffect(() => { if (Number(latText) !== start.lat) setLatText(start.lat.toFixed(5)); }, [start.lat]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (Number(lonText) !== start.lon) setLonText(start.lon.toFixed(5)); }, [start.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!searching) { setSeconds(0); return; }
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [searching]);

  // With a race loaded, climbing follows the race's metres-per-km until the user changes it.
  useEffect(() => {
    if (race && !vertTouched && Number(km) > 0) setVert(String(rehearsalGain(race, Number(km))));
  }, [race, km, vertTouched]);

  async function loadRace(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow picking the same file again
    if (!file) return;
    setRaceError(null);
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('That file is over 20 MB - is it really a GPX?');
      const xml = await file.text();
      const coords = parseGpx(xml);
      if (coords.length < 10) throw new Error('No track found in that file. Export the race as GPX and try again.');
      if (coords.every((c) => !c[2])) throw new Error('That GPX has no elevation data, so its climbs can\u2019t be copied.');
      setVertTouched(false);
      onRaceChange(summarizeRace(coords, gpxName(xml) ?? file.name.replace(/\.gpx$/i, '')));
    } catch (err) {
      setRaceError(err.message);
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) { setLocError('This browser can’t share your location.'); return; }
    setLocating(true); setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocating(false); onStartChange({ lat: pos.coords.latitude, lon: pos.coords.longitude }); },
      () => { setLocating(false); setLocError('Couldn’t get your location. Click the map instead.'); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function submit(e) {
    e.preventDefault();
    onSearch({
      lat: start.lat, lon: start.lon, km: Number(km), vert: Number(vert), practice,
      shape: race ? '' : shape,
      race: race ? { curve: race.curve, name: race.name } : undefined,
    });
  }

  const setCoord = (key, setText) => (e) => {
    setText(e.target.value);
    const n = Number(e.target.value);
    if (e.target.value !== '' && Number.isFinite(n)) onStartChange({ ...start, [key]: n });
  };

  return (
    <form className="search" onSubmit={submit}>
      <fieldset disabled={searching}>
        <div className="field">
          <span className="label">Start</span>
          <div className="row">
            <input aria-label="Start latitude" type="number" step="any" min="-90" max="90" required
              value={latText} onChange={setCoord('lat', setLatText)} />
            <input aria-label="Start longitude" type="number" step="any" min="-180" max="180" required
              value={lonText} onChange={setCoord('lon', setLonText)} />
          </div>
          <span className="hint">
            Click the map to move it, or{' '}
            <button type="button" className="link" onClick={useMyLocation}>{locating ? 'locating…' : 'use my location'}</button>
          </span>
          {locError && <span className="hint error-text">{locError}</span>}
        </div>

        <div className="row">
          <label className="field">
            <span className="label">Distance</span>
            <span className="unit-input">
              <input type="number" min="2" max="100" step="0.5" required value={km} onChange={(e) => setKm(e.target.value)} />
              <span>km</span>
            </span>
          </label>
          <label className="field">
            <span className="label">Climbing</span>
            <span className="unit-input">
              <input type="number" min="0" max="5000" step="10" required value={vert} onChange={(e) => { setVert(e.target.value); setVertTouched(true); }} />
              <span>m</span>
            </span>
          </label>
        </div>

        {race && (
          <span className="hint">
            {vertTouched
              ? <>Your own climbing target. <button type="button" className="link" onClick={() => setVertTouched(false)}>Match the race again</button></>
              : <>Climbing matches the race: {Math.round(race.gainPerKm)} m per km.</>}
          </span>
        )}

        <div className="field">
          <span className="label">Race rehearsal <span className="optional">optional</span></span>
          {race ? (
            <div className="race-box">
              <div className="race-head">
                <strong>{race.name}</strong>
                <button type="button" className="link" onClick={() => onRaceChange(null)}>Remove</button>
              </div>
              <span className="hint">
                {(race.distanceM / 1000).toFixed(1)} km · {race.gainM} m up · main climbs:
                {' '}{race.climbs.map((c) => `+${c.gainM} m at ${c.startPct}–${c.endPct}%`).join(', ') || 'none'}
              </span>
              <svg className="race-mini" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
                <path d={`M${race.profile.map(([f, h]) => `${(f * 100).toFixed(1)},${(22 - h * 20).toFixed(1)}`).join('L')}`}
                  fill="none" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
          ) : (
            <label className="upload">
              <input type="file" accept=".gpx,application/gpx+xml" onChange={loadRace} />
              <span>Upload a race GPX</span>
              <span className="hint">Get local loops with climbs in the same places, scaled to your distance.</span>
            </label>
          )}
          {raceError && <span className="hint error-text">{raceError}</span>}
        </div>

        <label className="field">
          <span className="label">Climb shape</span>
          <select value={race ? '' : shape} disabled={!!race} onChange={(e) => setShape(e.target.value)}>
            <option value="">{race ? 'Copied from the race' : 'Any'}</option>
            <option value="long">One long climb</option>
            <option value="rolling">Rolling hills</option>
            <option value="repeats">Hill repeats (rarely found yet)</option>
          </select>
        </label>

        {IS_DEV && (
          <label className="check">
            <input type="checkbox" checked={practice} onChange={(e) => setPractice(e.target.checked)} />
            <span>Practice mode <span className="muted">· made-up routes, no API use</span></span>
          </label>
        )}

        <button className="primary" type="submit">
          {searching ? `Searching… ${seconds} s` : 'Find routes'}
        </button>
        <span className="hint">
          {practice ? 'Practice routes are invented, not real paths.' : 'One search uses about 50 of your daily openrouteservice requests.'}
        </span>
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}

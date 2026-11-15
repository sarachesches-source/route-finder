'use client';
// "Plan your run": start point, distance, climbing, optional race to rehearse, and
// less-used options (climb shape, practice mode). Clicking the map also sets the start.
import { useEffect, useState } from 'react';
import { parseGpx, gpxName } from '../src/gpx.mjs';
import { summarizeRace, rehearsalGain, describeGrades } from '../src/rehearsal.mjs';
import { LocateIcon, UploadIcon, FlagIcon, ChevronIcon, SearchIcon, AlertIcon } from './icons';

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
      if (coords.every((c) => !c[2])) throw new Error('That GPX has no elevation data, so its climbs can’t be copied.');
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
      race: race ? { curve: race.curve, descent: race.descent, grades: race.grades, name: race.name } : undefined,
    });
  }

  const setCoord = (key, setText) => (e) => {
    setText(e.target.value);
    const n = Number(e.target.value);
    if (e.target.value !== '' && Number.isFinite(n)) onStartChange({ ...start, [key]: n });
  };

  return (
    <form className="search card card-pad" onSubmit={submit}>
      <div className="card-head">
        <h2 className="card-title">Plan your run</h2>
      </div>
      <fieldset disabled={searching}>
        <div className="field">
          <span className="field-label" id="start-label">Start point</span>
          <div className="start-row">
            <div className="start-inputs" role="group" aria-labelledby="start-label">
              <input className="input" aria-label="Start latitude" type="number" step="any" min="-90" max="90" required
                value={latText} onChange={setCoord('lat', setLatText)} />
              <input className="input" aria-label="Start longitude" type="number" step="any" min="-180" max="180" required
                value={lonText} onChange={setCoord('lon', setLonText)} />
            </div>
            <button type="button" className="btn btn-icon" onClick={useMyLocation}
              title="Use my location" aria-label="Use my location">
              {locating ? <span className="spinner" /> : <LocateIcon size={18} />}
            </button>
          </div>
          <span className="field-note">{locError
            ? <span className="error-text">{locError}</span>
            : 'Tip: click anywhere on the map to set the start.'}</span>
        </div>

        <div className="row-2">
          <label className="field">
            <span className="field-label">Distance</span>
            <span className="unit-input">
              <input className="input" type="number" min="2" max="100" step="0.5" required value={km} onChange={(e) => setKm(e.target.value)} />
              <span className="unit">km</span>
            </span>
          </label>
          <label className="field">
            <span className="field-label">Climbing</span>
            <span className="unit-input">
              <input className="input" type="number" min="0" max="5000" step="10" required value={vert}
                onChange={(e) => { setVert(e.target.value); setVertTouched(true); }} />
              <span className="unit">m</span>
            </span>
          </label>
        </div>

        <div className="field">
          <span className="field-label">Train for a race <span className="optional">optional</span></span>
          {race ? (
            <div className="race-box">
              <div className="race-head">
                <strong><FlagIcon /> {race.name}</strong>
                <button type="button" className="link" onClick={() => onRaceChange(null)}>Remove</button>
              </div>
              <div className="race-stats">
                <span>{(race.distanceM / 1000).toFixed(1)} km</span>
                <span>{race.gainM} m up</span>
                <span>{Math.round(race.gainPerKm)} m/km</span>
                {race.climbs.length > 0 && <span>{race.climbs.length} main climb{race.climbs.length > 1 ? 's' : ''}</span>}
              </div>
              <svg className="race-mini" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
                <path d={`M${race.profile.map(([f, h]) => `${(f * 100).toFixed(1)},${(22 - h * 20).toFixed(1)}`).join('L')}`}
                  fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              </svg>
              {race.grades && <span className="hint">Steepness: {describeGrades(race.grades)}</span>}
              <span className="hint">
                {vertTouched
                  ? <>Using your own climbing target. <button type="button" className="link" onClick={() => setVertTouched(false)}>Match the race</button></>
                  : <>Climbing set to the race’s {Math.round(race.gainPerKm)} m per km.</>}
              </span>
            </div>
          ) : (
            <label className="upload">
              <input type="file" accept=".gpx,application/gpx+xml" onChange={loadRace} />
              <span className="upload-icon"><UploadIcon /></span>
              <span>
                <strong>Upload a race GPX</strong>
                <small>Get local loops with climbs in the same places.</small>
              </span>
            </label>
          )}
          {raceError && <span className="field-note error-text">{raceError}</span>}
        </div>

        <details className="more">
          <summary><ChevronIcon size={14} /> More options</summary>
          <div className="more-body">
            <label className="field">
              <span className="field-label">Climb shape</span>
              <select className="select" value={race ? '' : shape} disabled={!!race} onChange={(e) => setShape(e.target.value)}>
                <option value="">{race ? 'Copied from the race' : 'Any'}</option>
                <option value="long">One long climb</option>
                <option value="rolling">Rolling hills</option>
                <option value="repeats">Hill repeats (rarely found yet)</option>
              </select>
            </label>
            {IS_DEV && (
              <label className="switch">
                <input type="checkbox" checked={practice} onChange={(e) => setPractice(e.target.checked)} />
                <span>Practice mode<small>Made-up routes, no API use</small></span>
              </label>
            )}
          </div>
        </details>

        <button className="btn btn-primary" type="submit">
          {searching
            ? <><span className="spinner" /> Finding routes… {seconds}s</>
            : <><SearchIcon size={18} /> Find routes</>}
        </button>
        <p className="submit-note">
          {practice ? 'Practice routes are invented, not real paths.' : 'Searches real paths from OpenStreetMap.'}
        </p>
      </fieldset>
      {error && <p className="alert" role="alert"><AlertIcon /> <span>{error}</span></p>}
    </form>
  );
}

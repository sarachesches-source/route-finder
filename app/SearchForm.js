'use client';
// Start point, distance, climbing and climb shape. Clicking the map also sets the start.
import { useEffect, useState } from 'react';

const IS_DEV = process.env.NODE_ENV !== 'production';

export default function SearchForm({ start, onStartChange, onSearch, searching, error }) {
  const [km, setKm] = useState('15');
  const [vert, setVert] = useState('500');
  const [shape, setShape] = useState('');
  const [practice, setPractice] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState(null);
  const [seconds, setSeconds] = useState(0);
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
    onSearch({ lat: start.lat, lon: start.lon, km: Number(km), vert: Number(vert), shape, practice });
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
              <input type="number" min="0" max="5000" step="10" required value={vert} onChange={(e) => setVert(e.target.value)} />
              <span>m</span>
            </span>
          </label>
        </div>

        <label className="field">
          <span className="label">Climb shape</span>
          <select value={shape} onChange={(e) => setShape(e.target.value)}>
            <option value="">Any</option>
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

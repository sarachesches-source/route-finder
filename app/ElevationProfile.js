'use client';
// Elevation chart for one route. Climbs are shaded; moving over the chart
// reports the point back so the map can show where you are.

const W = 1000, H = 150;

function nearestIndex(along, d) {
  let lo = 0, hi = along.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (along[mid] < d) lo = mid; else hi = mid;
  }
  return d - along[lo] < along[hi] - d ? lo : hi;
}

// `ghost`: optional race outline [[fraction of distance, 0..1 height], ...], drawn dashed and
// stretched over this route so the two climb patterns can be compared by eye.
export default function ElevationProfile({ route, color, hoverIdx, onHover, activeClimb, ghost }) {
  const { coords, along, climbs } = route;
  const distanceM = along.at(-1) || 1; // chart length = measured along the points
  const ele = coords.map((c) => c[2]);
  const minE = Math.min(...ele), maxE = Math.max(...ele);
  const pad = Math.max(10, (maxE - minE) * 0.12);
  const lo = minE - pad, hi = maxE + pad;
  const x = (d) => (d / distanceM) * W;
  const y = (e) => H - ((e - lo) / (hi - lo)) * H;

  const line = coords.map((c, i) => `${i ? 'L' : 'M'}${x(along[i]).toFixed(1)},${y(c[2]).toFixed(1)}`).join('');
  const area = `${line}L${W},${H}L0,${H}Z`;
  const ghostLine = ghost?.length
    ? ghost.map(([f, h], i) => `${i ? 'L' : 'M'}${(f * W).toFixed(1)},${y(minE + h * (maxE - minE)).toFixed(1)}`).join('')
    : null;

  function handleMove(e) {
    const box = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    onHover(nearestIndex(along, frac * distanceM));
  }

  const hover = hoverIdx != null ? { d: along[hoverIdx], e: ele[hoverIdx] } : null;

  return (
    <div className="profile">
      <div className="readout">
        {hover
          ? <>km <strong>{(hover.d / 1000).toFixed(1)}</strong> · <strong>{Math.round(hover.e)} m</strong> high</>
          : <span className="muted">Move over the chart to follow it on the map</span>}
      </div>
      <div style={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          onPointerMove={handleMove}
          onPointerDown={handleMove}
          onPointerLeave={() => onHover(null)}
          role="img"
          aria-label={`Elevation profile: ${Math.round(minE)} to ${Math.round(maxE)} metres`}
        >
          {climbs.map((c, i) => (
            <rect
              key={i} x={x(c.startM)} y={0} width={Math.max(1, x(c.endM) - x(c.startM))} height={H}
              fill="var(--climb)"
              opacity={activeClimb && activeClimb !== c ? 0.35 : 1}
            />
          ))}
          <path d={area} fill="var(--profile-fill)" />
          {ghostLine && (
            <path d={ghostLine} fill="none" stroke="var(--profile-line)" strokeWidth="1.5" strokeDasharray="5 4"
              opacity="0.6" vectorEffect="non-scaling-stroke" />
          )}
          <path d={line} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          {hover && (
            <line x1={x(hover.d)} x2={x(hover.d)} y1={0} y2={H}
              stroke="var(--profile-line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        <span className="ele-label" style={{ top: 2 }}>{Math.round(maxE)} m</span>
        <span className="ele-label" style={{ bottom: 2 }}>{Math.round(minE)} m</span>
      </div>
      {ghostLine && <div className="hint">Dashed line: the race’s shape, stretched to this route’s length.</div>}
      <div className="axis">
        <span>0 km</span>
        <span>{(distanceM / 2000).toFixed(1)} km</span>
        <span>{(distanceM / 1000).toFixed(1)} km</span>
      </div>
    </div>
  );
}

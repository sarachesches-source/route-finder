'use client';
// The map. Draws the routes, highlights the selected one, shows the start pin
// (click anywhere to move it) and a dot for the point hovered on the elevation chart.
import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { surfaceFeatures, SURFACE_COLORS } from '../src/surface.mjs';

maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs'); // copied there by scripts/copy-map-worker.mjs

// Free map tiles, no account needed. Topo shows contour lines and trails.
const STYLES = {
  streets: 'https://tiles.openfreemap.org/styles/liberty',
  topo: {
    version: 8,
    sources: {
      topo: {
        type: 'raster',
        tiles: ['a', 'b', 'c'].map((s) => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`),
        tileSize: 256,
        maxzoom: 17,
        attribution: 'Map data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM · Style © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
      },
    },
    layers: [{ id: 'topo', type: 'raster', source: 'topo' }],
  },
};

const lineId = (i) => `route-${i}-line`;
const casingId = (i) => `route-${i}-casing`;

function boundsOf(coords) {
  const b = new maplibregl.LngLatBounds();
  for (const [lon, lat] of coords) b.extend([lon, lat]);
  return b;
}

/** Remove old route layers and draw the current routes. */
function drawRoutes(map, { routes, selected, colors, colorBy }) {
  const style = map.getStyle();
  for (const layer of style.layers) if (layer.id.startsWith('route-')) map.removeLayer(layer.id);
  for (const id of Object.keys(style.sources)) if (id.startsWith('route-')) map.removeSource(id);
  routes.forEach((r, i) => {
    const id = `route-${i}`;
    map.addSource(id, {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'LineString', coordinates: r.coords.map(([lon, lat]) => [lon, lat]) } },
    });
    map.addLayer({
      id: casingId(i), type: 'line', source: id,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.8 },
    });
    map.addLayer({
      id: lineId(i), type: 'line', source: id,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': colors[i % colors.length], 'line-width': 4 },
    });
  });
  highlight(map, routes.length, selected);
  drawSurface(map, routes[selected], colorBy === 'surface', selected);
  drawWater(map, routes[selected]);
  stackOverlays(map);
}

/** Selected route coloured by surface (trail / gravel / paved; unknown dashed). Empty when off. */
function drawSurface(map, route, on, index) {
  // Hide the selected route's own colour underneath, so dashed 'unknown' stretches read clearly.
  if (index != null && map.getLayer(lineId(index))) map.setPaintProperty(lineId(index), 'line-opacity', on && route?.surface ? 0 : 1);
  const data = on && route?.surface?.sections
    ? surfaceFeatures(route.coords, route.surface.sections)
    : { type: 'FeatureCollection', features: [] };
  const source = map.getSource('surface');
  if (source) { source.setData(data); return; }
  map.addSource('surface', { type: 'geojson', data });
  const color = ['match', ['get', 'group'], 'trail', SURFACE_COLORS.trail, 'gravel', SURFACE_COLORS.gravel,
    'paved', SURFACE_COLORS.paved, SURFACE_COLORS.unknown];
  map.addLayer({
    id: 'surface-line', type: 'line', source: 'surface', filter: ['!=', ['get', 'group'], 'unknown'],
    layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': color, 'line-width': 5 },
  });
  map.addLayer({
    id: 'surface-unknown', type: 'line', source: 'surface', filter: ['==', ['get', 'group'], 'unknown'],
    paint: { 'line-color': SURFACE_COLORS.unknown, 'line-width': 5, 'line-dasharray': [1.5, 1] },
  });
}

/** Keep surface colours above the routes and water dots above everything. */
function stackOverlays(map) {
  for (const id of ['surface-line', 'surface-unknown', 'water-dots']) if (map.getLayer(id)) map.moveLayer(id);
}

/** Blue dots for the selected route's water stops. */
function drawWater(map, route) {
  const data = {
    type: 'FeatureCollection',
    features: (route?.water?.stops ?? []).map((s) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [s.lon, s.lat] }, properties: {},
    })),
  };
  const source = map.getSource('water');
  if (source) { source.setData(data); return; }
  map.addSource('water', { type: 'geojson', data });
  map.addLayer({
    id: 'water-dots', type: 'circle', source: 'water',
    paint: { 'circle-radius': 6, 'circle-color': '#2a7ab0', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 },
  });
}

function highlight(map, count, selected) {
  for (let i = 0; i < count; i++) {
    if (!map.getLayer(lineId(i))) return;
    const on = i === selected;
    map.setPaintProperty(lineId(i), 'line-width', on ? 5 : 3);
    map.setPaintProperty(lineId(i), 'line-opacity', on ? 1 : 0.4);
    map.setPaintProperty(casingId(i), 'line-opacity', on ? 0.9 : 0);
  }
  if (map.getLayer(lineId(selected))) {
    map.moveLayer(casingId(selected));
    map.moveLayer(lineId(selected));
  }
}

export default function MapView({ routes, selected, colors, hoverPoint, focus, mapStyle, start, onSelect, onPickStart, colorBy = 'route', viewKey = 0 }) {
  const container = useRef(null);
  const mapRef = useRef(null);
  const hoverMarker = useRef(null);
  const startMarker = useRef(null);
  const latest = useRef(null);
  latest.current = { routes, selected, colors, onSelect, onPickStart, colorBy };
  const firstStyle = useRef(mapStyle);
  const firstRoutes = useRef(true);

  // Create the map once.
  useEffect(() => {
    const map = new maplibregl.Map({
      container: container.current,
      style: STYLES[firstStyle.current],
      ...(routes.length
        ? { bounds: boundsOf(routes.flatMap((r) => r.coords)), fitBoundsOptions: { padding: 50 } }
        : { center: [start.lon, start.lat], zoom: 12 }),
      attributionControl: { compact: true }, // credits fold into an (i) button on small screens
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    // Runs on first load and again whenever the map style is switched.
    map.on('style.load', () => drawRoutes(map, latest.current));

    const routeLayers = () => latest.current.routes.map((_, i) => lineId(i)).filter((id) => map.getLayer(id));
    // Click a route to select it; click anywhere else to move the start.
    map.on('click', (e) => {
      const layers = routeLayers();
      const hit = layers.length ? map.queryRenderedFeatures(e.point, { layers }) : [];
      if (hit.length) latest.current.onSelect(Number(hit[0].layer.id.split('-')[1]));
      else latest.current.onPickStart?.({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    });
    map.on('mousemove', (e) => {
      const layers = routeLayers();
      const over = layers.length && map.queryRenderedFeatures(e.point, { layers }).length;
      map.getCanvas().style.cursor = over ? 'pointer' : 'crosshair';
    });

    const pin = document.createElement('div');
    pin.className = 'start-pin';
    pin.title = 'Start / finish';
    startMarker.current = new maplibregl.Marker({ element: pin }).setLngLat([start.lon, start.lat]).addTo(map);

    const dot = document.createElement('div');
    dot.className = 'hover-dot';
    hoverMarker.current = new maplibregl.Marker({ element: dot });

    mapRef.current = map;
    if (process.env.NODE_ENV !== 'production') window.__map = map; // for debugging in the browser console
    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New search results: redraw and show them all.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || firstRoutes.current) { firstRoutes.current = false; return; }
    try { drawRoutes(map, latest.current); } catch { /* style still loading: 'style.load' will draw */ }
    if (routes.length) map.fitBounds(boundsOf(routes.flatMap((r) => r.coords)), { padding: 50, duration: 600 });
  }, [routes]);

  // Highlight and zoom to the selected route.
  const didSelect = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    highlight(map, routes.length, selected);
    // Only once the routes are drawn (map ready); before that, 'style.load' draws the water.
    if (map.getLayer(lineId(selected))) {
      drawSurface(map, routes[selected], colorBy === 'surface', selected);
      drawWater(map, routes[selected]);
      stackOverlays(map);
    }
    if (!didSelect.current) { didSelect.current = true; return; } // first view shows all routes
    if (routes[selected]) map.fitBounds(boundsOf(routes[selected].coords), { padding: 50, duration: 600 });
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Switch the selected route between its own colour and surface colours.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(lineId(selected))) return; // not ready: 'style.load' draws it
    drawSurface(map, routes[selected], colorBy === 'surface', selected);
    stackOverlays(map);
  }, [colorBy]); // eslint-disable-line react-hooks/exhaustive-deps

  // Zoom to a climb when one is picked from the list.
  useEffect(() => {
    if (mapRef.current && focus?.length > 1) {
      mapRef.current.fitBounds(boundsOf(focus), { padding: 80, duration: 600, maxZoom: 16 });
    }
  }, [focus?.length, focus?.[0]?.[0], focus?.[0]?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fly to the start point when asked (e.g. the planner opened near the visitor).
  useEffect(() => {
    if (!viewKey || !mapRef.current) return;
    mapRef.current.jumpTo({ center: [start.lon, start.lat], zoom: 12 });
  }, [viewKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Move the start pin when the start changes (map click, typing, or "use my location").
  useEffect(() => {
    if (startMarker.current && Number.isFinite(start.lat) && Number.isFinite(start.lon)) {
      startMarker.current.setLngLat([start.lon, start.lat]);
    }
  }, [start.lat, start.lon]);

  // Switch between topo and streets.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapStyle === firstStyle.current) { firstStyle.current = null; return; }
    firstStyle.current = null;
    map.setStyle(STYLES[mapStyle], { diff: false }); // full reload, so 'style.load' redraws the routes
  }, [mapStyle]);

  // Dot on the map for the point under the cursor on the elevation chart.
  useEffect(() => {
    const map = mapRef.current, marker = hoverMarker.current;
    if (!map || !marker) return;
    if (hoverPoint) marker.setLngLat([hoverPoint[0], hoverPoint[1]]).addTo(map);
    else marker.remove();
  }, [hoverPoint]);

  return <div ref={container} className="map" />;
}

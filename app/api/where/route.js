// GET /api/where -> the visitor's approximate area, so the planner can open near them.
// Vercel adds these headers from the visitor's internet connection (city level, not exact).
// Nothing is stored or logged. Locally there are no such headers, so the answer is {}.
export const dynamic = 'force-dynamic';

export function GET(request) {
  const h = request.headers;
  const lat = h.get('x-vercel-ip-latitude');
  const lon = h.get('x-vercel-ip-longitude');
  const noStore = { headers: { 'Cache-Control': 'private, no-store' } };
  if (lat == null || lon == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) {
    return Response.json({}, noStore);
  }
  const city = h.get('x-vercel-ip-city');
  let cityName = null;
  try { cityName = city ? decodeURIComponent(city) : null; } catch { cityName = city; }
  return Response.json({
    lat: Math.round(Number(lat) * 1000) / 1000, // ~100 m: plenty for a starting view
    lon: Math.round(Number(lon) * 1000) / 1000,
    city: cityName,
    country: h.get('x-vercel-ip-country') || null,
  }, noStore);
}

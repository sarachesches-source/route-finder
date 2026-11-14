// Read GPX files (ours, and most watch/app exports) into [lon, lat, ele] points.

export function parseGpx(xml) {
  const pts = [];
  const re = /<(trkpt|rtept)\s+([^>]*?)\/?>(?:([\s\S]*?)<\/\1>)?/g;
  for (let m; (m = re.exec(xml));) {
    const lat = Number(/lat="([^"]+)"/.exec(m[2])?.[1]);
    const lon = Number(/lon="([^"]+)"/.exec(m[2])?.[1]);
    const ele = Number(/<ele>([^<]+)<\/ele>/.exec(m[3] ?? '')?.[1] ?? 0);
    if (Number.isFinite(lat) && Number.isFinite(lon)) pts.push([lon, lat, ele]);
  }
  return pts;
}

export function gpxName(xml) {
  return /<name>([^<]*)<\/name>/.exec(xml)?.[1]?.trim() || null;
}

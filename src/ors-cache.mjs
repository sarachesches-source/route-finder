// Saves openrouteservice answers to disk, so asking the exact same question again
// (same start, length, shape) costs no API quota. Server/CLI only: uses the file system.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Wrap a fetch function with a disk cache. Only successful answers are saved.
 * The returned function has `.stats` = { hits, misses } for reporting.
 */
export function cachedFetch(fetchImpl, { dir = '.cache/ors', maxAgeDays = 30 } = {}) {
  const stats = { hits: 0, misses: 0 };
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  const wrapped = async (url, init = {}) => {
    // The key covers the question asked, not the API key, so it survives a key change.
    const key = createHash('sha256').update(`${url}\n${init.body ?? ''}`).digest('hex').slice(0, 32);
    const file = path.join(dir, `${key}.json`);
    try {
      if (Date.now() - statSync(file).mtimeMs < maxAgeMs) {
        const data = JSON.parse(readFileSync(file, 'utf8'));
        stats.hits++;
        return answer(data);
      }
    } catch { /* not cached yet, or unreadable: ask the real service */ }

    const res = await fetchImpl(url, init);
    if (!res.ok) return res; // errors (quota, rate limit) are never cached
    stats.misses++;
    const data = await res.json();
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, JSON.stringify(data));
    } catch { /* can't write the cache: still return the answer */ }
    return answer(data);
  };
  wrapped.stats = stats;
  return wrapped;
}

function answer(data) {
  return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
}

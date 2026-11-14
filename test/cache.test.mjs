import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { cachedFetch } from '../src/ors-cache.mjs';
import { findRoutes } from '../src/engine.mjs';
import { fakeOrsFetch } from '../src/fake-ors.mjs';

function tempDir() { return mkdtempSync(path.join(tmpdir(), 'ors-cache-test-')); }

test('the same search twice: second time uses no requests and gives the same routes', async () => {
  const dir = tempDir();
  try {
    let calls = 0;
    const counting = (url, init) => { calls++; return fakeOrsFetch(url, init); };
    const target = { lat: 46.7712, lon: 23.6236, distanceM: 15000, gainM: 500 };
    const opts = { apiKey: 'x', sleep: async () => {} };

    const first = cachedFetch(counting, { dir });
    const a = await findRoutes(target, { ...opts, fetchImpl: first });
    const firstCalls = calls;
    assert.ok(firstCalls > 0);
    assert.equal(first.stats.hits, 0);
    assert.equal(first.stats.misses, firstCalls);

    const second = cachedFetch(counting, { dir });
    const b = await findRoutes(target, { ...opts, fetchImpl: second });
    assert.equal(calls, firstCalls, 'second search should not call the service');
    assert.equal(second.stats.hits, firstCalls);
    assert.deepEqual(b.routes.map((r) => [r.distanceM, r.gainM]), a.routes.map((r) => [r.distanceM, r.gainM]));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('errors are not cached, and old answers expire', async () => {
  const dir = tempDir();
  try {
    let calls = 0;
    const quota = async () => { calls++; return { ok: false, status: 403, text: async () => 'Quota exceeded' }; };
    const f = cachedFetch(quota, { dir });
    assert.equal((await f('u', { body: 'q' })).status, 403);
    assert.equal((await f('u', { body: 'q' })).status, 403);
    assert.equal(calls, 2);
    assert.equal(readdirSync(dir).length, 0);

    let okCalls = 0;
    const ok = async () => { okCalls++; return { ok: true, status: 200, json: async () => ({ n: okCalls }) }; };
    const g = cachedFetch(ok, { dir, maxAgeDays: 30 });
    await g('u', { body: 'q' });
    assert.deepEqual(await (await g('u', { body: 'q' })).json(), { n: 1 }); // from cache
    const [file] = readdirSync(dir);
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    utimesSync(path.join(dir, file), old, old);
    assert.deepEqual(await (await g('u', { body: 'q' })).json(), { n: 2 }); // expired: asked again
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

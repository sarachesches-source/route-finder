import test from 'node:test';
import assert from 'node:assert/strict';
import { createLimiter, visitorKey, serverLimiter } from '../src/limits.mjs';

test('per-visitor limit: 3 an hour, then wait; other visitors unaffected', () => {
  let t = Date.UTC(2026, 10, 15, 12, 0);
  const lim = createLimiter({ perHour: 3, dailyBudget: 1000, now: () => t });
  for (let i = 0; i < 3; i++) { assert.equal(lim.check('a').ok, true); lim.record('a'); t += 60000; }
  const blocked = lim.check('a');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'visitor');
  assert.equal(blocked.retryInMin, 57); // first search was 3 min ago
  assert.equal(lim.check('b').ok, true);
  t += 57 * 60000;
  assert.equal(lim.check('a').ok, true, 'free again an hour after the first search');
});

test('daily budget counts real requests only, and resets the next day', () => {
  let t = Date.UTC(2026, 10, 15, 22, 0);
  const lim = createLimiter({ perHour: 100, dailyBudget: 100, now: () => t });
  lim.spend(60);
  assert.equal(lim.remaining(), 40);
  lim.spend(0); // a search answered from cache
  assert.equal(lim.check('a').ok, true);
  lim.spend(45);
  assert.deepEqual(lim.check('a'), { ok: false, reason: 'daily' });
  t += 3 * 60 * 60 * 1000; // past midnight UTC
  assert.equal(lim.check('a').ok, true);
  assert.equal(lim.remaining(), 100);
});

test('visitor key is a hash, never the IP itself', () => {
  const h = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' });
  const key = visitorKey(h);
  assert.match(key, /^[0-9a-f]{16}$/);
  assert.ok(!key.includes('203'));
  assert.equal(key, visitorKey(new Headers({ 'x-forwarded-for': '203.0.113.7' })));
  assert.notEqual(key, visitorKey(new Headers({ 'x-forwarded-for': '198.51.100.2' })));
});

test('limits are off in development unless configured', () => {
  assert.equal(serverLimiter({ NODE_ENV: 'development' }), null);
  assert.ok(serverLimiter({ NODE_ENV: 'production' }));
});

test('after the routing quota runs out, visitors are answered straight away for an hour', () => {
  let t = Date.UTC(2026, 10, 19, 12, 0);
  const lim = createLimiter({ perHour: 5, dailyBudget: 1000, now: () => t });
  assert.equal(lim.check('a').ok, true);
  lim.markQuotaOut();
  assert.deepEqual(lim.check('b'), { ok: false, reason: 'quota' });
  t += 61 * 60000;
  assert.equal(lim.check('b').ok, true, 'tries again after an hour');
  lim.noteRemaining(500);
  assert.equal(lim.check('c').ok, true, 'plenty left: keep going');
  lim.noteRemaining(12);
  assert.equal(lim.check('c').reason, 'quota', 'less than one search left: stop early');
  lim.noteRemaining(undefined); // service gave no number: nothing changes
});

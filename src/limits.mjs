// Search limits for a public site, so visitors can't use up the daily openrouteservice
// allowance (free plan: about 2,000 route requests a day; one fresh search ~55).
//  - per visitor: at most `perHour` real searches in any 60 minutes
//  - whole site: stop once `dailyBudget` requests have been used today (UTC)
// Kept in memory: simple, but resets when the server restarts, and on serverless hosting
// each running copy has its own count. Good enough to stop accidents and casual abuse.
import { createHash } from 'node:crypto';

const HOUR = 60 * 60 * 1000;
const dayKey = (t) => new Date(t).toISOString().slice(0, 10);

/** Visitor key from request headers: a short hash, so no IP address is ever stored. */
export function visitorKey(headers) {
  const ip = headers.get('x-forwarded-for')?.split(',')[0].trim() || headers.get('x-real-ip') || 'local';
  return createHash('sha256').update(`hillgorithm:${ip}`).digest('hex').slice(0, 16);
}

export function createLimiter({ perHour = 5, dailyBudget = 1500, now = Date.now } = {}) {
  const visits = new Map(); // visitor key -> timestamps of recent searches
  let day = dayKey(now()), used = 0;
  let quotaOutUntil = 0;     // routing service said its daily quota is used up

  function roll() {
    const today = dayKey(now());
    if (today !== day) { day = today; used = 0; }
    if (visits.size > 5000) { // forget visitors with nothing in the last hour
      for (const [k, list] of visits) if (!list.some((t) => now() - t < HOUR)) visits.delete(k);
    }
  }

  return {
    /** { ok: true } or { ok: false, reason: 'quota' | 'daily' | 'visitor', retryInMin } */
    check(key) {
      roll();
      if (now() < quotaOutUntil) return { ok: false, reason: 'quota' };
      if (used >= dailyBudget) return { ok: false, reason: 'daily' };
      const recent = (visits.get(key) ?? []).filter((t) => now() - t < HOUR);
      visits.set(key, recent);
      if (recent.length >= perHour) {
        return { ok: false, reason: 'visitor', retryInMin: Math.max(1, Math.ceil((recent[0] + HOUR - now()) / 60000)) };
      }
      return { ok: true };
    },
    /** Count a search for this visitor (call when it starts). */
    record(key) { roll(); visits.set(key, [...(visits.get(key) ?? []), now()]); },
    /** Count routing requests actually sent (cache misses), after a search. */
    spend(requests) { roll(); used += requests; },
    remaining() { roll(); return Math.max(0, dailyBudget - used); },
    /** The routing service ran out: answer visitors straight away instead of asking it again. */
    markQuotaOut(ms = HOUR) { quotaOutUntil = Math.max(quotaOutUntil, now() + ms); },
    /** Requests left as reported by the routing service; stop early below one search's worth. */
    noteRemaining(left, threshold = 40) { if (Number.isFinite(left) && left < threshold) this.markQuotaOut(); },
  };
}

/** One limiter for the running server. Off in development unless limits are set in .env. */
let shared = null;
export function serverLimiter(env = process.env) {
  const configured = env.SEARCHES_PER_HOUR || env.DAILY_REQUEST_BUDGET;
  if (env.NODE_ENV !== 'production' && !configured) return null;
  shared ??= createLimiter({
    perHour: Number(env.SEARCHES_PER_HOUR) || 5,
    dailyBudget: Number(env.DAILY_REQUEST_BUDGET) || 1500,
  });
  return shared;
}

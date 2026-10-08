const { randomUUID } = require('crypto');
const { businessDate } = require('./weatherMood');
const {
  defaultRepository,
} = require('../repositories/weatherProtectionRepository');
const LIMITS = Object.freeze({
  'amap-weather': { day: 140, month: 4500 },
  'amap-lbs': { day: 3500, month: 120000 },
  'global-weather': { day: 1000, month: 20000 },
  'global-cities': { day: 500, month: 10000 },
});
function groupFor(url) {
  if (url.hostname === 'restapi.amap.com') {
    if (url.pathname === '/v3/weather/weatherInfo') return 'amap-weather';
    if (['/v3/geocode/regeo', '/v3/config/district'].includes(url.pathname))
      return 'amap-lbs';
    throw Error('UNSUPPORTED_AMAP_ENDPOINT');
  }
  if (url.hostname === 'api.open-meteo.com') return 'global-weather';
  return 'global-cities';
}
function limited(reason, retryAfter = 60) {
  return Object.assign(
    new Error(
      reason === 'quota'
        ? '今日城市或天气服务额度已达本站上限，请稍后再试。'
        : '城市或天气服务繁忙，请稍后再试。',
    ),
    { publicCode: 'WEATHER_UPSTREAM_LIMIT', status: 429, retryAfter },
  );
}
function createBudgetFetch({
  repository,
  fetchImpl = fetch,
  clock = Date.now,
  limits = LIMITS,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  const repo = () => repository || defaultRepository();
  let pending = 0;
  return async function budgetFetch(input, options = {}) {
    if (pending >= 32) throw limited('busy');
    pending++;
    try {
      const url = new URL(input);
      const group = groupFor(url),
        cap = limits[group],
        id = randomUUID();
      let decision;
      for (let attempt = 0; attempt < 10; attempt++) {
        const now = clock(),
          date = businessDate(new Date(now)),
          month = date.slice(0, 7);
        try {
          decision = await repo().mutate(group, (state) => {
            if (state.month !== month) {
              state.month = month;
              state.monthCount = 0;
            }
            if (state.date !== date) {
              state.date = date;
              state.dayCount = 0;
            }
            if (
              !Number.isSafeInteger(state.dayCount) ||
              state.dayCount < 0 ||
              !Number.isSafeInteger(state.monthCount) ||
              state.monthCount < 0
            )
              throw Error('INVALID_BUDGET_STATE');
            state.leases = (state.leases || []).filter(
              (item) => item.until > now,
            );
            if (state.dayCount >= cap.day || state.monthCount >= cap.month)
              return 'quota';
            // 600 ms between starts, at most two active requests, shared by API processes.
            if (state.nextAt > now || state.leases.length >= 2) return 'busy';
            state.nextAt = now + 600;
            state.leases.push({ id, until: now + 15000 });
            state.dayCount++;
            state.monthCount++;
            return 'ok';
          });
        } catch {
          throw limited('busy');
        }
        if (decision !== 'busy' || attempt === 9) break;
        await wait(600);
      }
      if (decision !== 'ok') throw limited(decision);
      try {
        // Keep the lease until the response body is consumed; do not refund failed attempts.
        const signal = options.signal
          ? AbortSignal.any([options.signal, AbortSignal.timeout(8000)])
          : AbortSignal.timeout(8000);
        const response = await fetchImpl(input, {
          ...options,
          signal,
          redirect: 'error',
        });
        const bytes = await response.arrayBuffer();
        return new Response(bytes, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      } finally {
        try {
          await repo().mutate(group, (state) => {
            state.leases = (state.leases || []).filter(
              (item) => item.id !== id && item.until > clock(),
            );
          });
        } catch {
          /* Lease expires automatically. A failed cleanup never restores quota. */
        }
      }
    } finally {
      pending--;
    }
  };
}
module.exports = { LIMITS, groupFor, createBudgetFetch };

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getAuthTokenFromRequest } = require('./auth');
const COOKIE = 'mooncci_companion_client';
const TTL = 30 * 86400000;
function createClientIdentity({
  secret = () => process.env.JWT_SECRET,
  clock = Date.now,
} = {}) {
  return (req, res, next) => {
    const key = secret();
    if (!key) return res.status(503).json({ message: '天气服务暂不可用。' });
    const sign = (body) =>
      crypto
        .createHmac('sha256', key)
        .update('companion:' + body)
        .digest('base64url');
    const raw =
      (req.headers.cookie || '')
        .split(';')
        .map((v) => v.trim())
        .find((v) => v.startsWith(COOKIE + '='))
        ?.slice(COOKIE.length + 1) || '';
    let token = raw;
    const [id, expires, signature] = raw.split('.');
    const body = `${id}.${expires}`;
    const valid =
      /^[a-f0-9]{32}$/.test(id || '') &&
      /^\d{13}$/.test(expires || '') &&
      Number(expires) > clock() &&
      Number(expires) <= clock() + TTL &&
      typeof signature === 'string' &&
      /^[A-Za-z0-9_-]{43}$/.test(signature) &&
      crypto.timingSafeEqual(Buffer.from(sign(body)), Buffer.from(signature));
    if (!valid) {
      const body = `${crypto.randomBytes(16).toString('hex')}.${clock() + TTL}`;
      token = `${body}.${sign(body)}`;
      res.cookie(COOKIE, token, {
        httpOnly: true,
        secure: req.secure,
        sameSite: 'lax',
        path: '/api/weather-mood',
        maxAge: TTL,
      });
    }
    req.weatherClientKeys = ['browser:' + token.split('.')[0]];
    try {
      const payload = jwt.verify(getAuthTokenFromRequest(req), key, {
        algorithms: ['HS256'],
      });
      if (Number.isSafeInteger(payload.id) && payload.id > 0)
        req.weatherClientKeys.push('account:' + payload.id);
    } catch {
      /* Anonymous visitor. This identity is only for limits, never authorization. */
    }
    next();
  };
}
function createClientLimiter(max, { clock = Date.now, capacity = 10000 } = {}) {
  const buckets = new Map(),
    networks = new Map();
  function take(map, key, limit, now) {
    let item = map.get(key);
    if (!item || item.until <= now) {
      if (map.size >= capacity)
        for (const [k, v] of map) if (v.until <= now) map.delete(k);
      if (!item && map.size >= capacity)
        return { blocked: true, until: now + 60000 };
      item = { count: 0, until: now + 60000 };
      map.set(key, item);
    }
    item.count++;
    return {
      blocked: item.count > limit,
      until: item.until,
      remaining: Math.max(0, limit - item.count),
    };
  }
  return (req, res, next) => {
    const now = clock();
    // A deliberately loose shared-IP guard does not replace the per-browser/account limits.
    const checks = [
      take(networks, req.ip || 'unknown', 10000, now),
      ...(req.weatherClientKeys || ['unidentified:' + req.ip]).map((key) =>
        take(buckets, key, max, now),
      ),
    ];
    const denied = checks.find((item) => item.blocked),
      retry = Math.max(
        1,
        Math.ceil(((denied || checks[1]).until - now) / 1000),
      );
    res.set('RateLimit-Limit', String(max));
    res.set(
      'RateLimit-Remaining',
      String(Math.min(...checks.map((v) => v.remaining || 0))),
    );
    res.set('RateLimit-Reset', String(retry));
    if (denied)
      return res
        .status(429)
        .set('Retry-After', String(retry))
        .json({ message: '操作过于频繁，请稍后再试。' });
    next();
  };
}
// Exempt only the companion routes from the legacy 200/min shared-IP cap.
function outsideWeatherGlobal(limiter) {
  return (req, res, next) =>
    /^\/weather-mood(?:\/|$)/.test(req.path) ? next() : limiter(req, res, next);
}
module.exports = {
  createClientIdentity,
  createClientLimiter,
  outsideWeatherGlobal,
  COOKIE,
};

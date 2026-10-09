const { isIP } = require('node:net');
const { createHash } = require('node:crypto');
const { lookupGlobalIp, globalIpCity } = require('./weatherGlobalIp');
function unavailable() {
  return Object.assign(new Error('当前网络暂未识别出城市，请重试或搜索城市。'), { publicCode: 'CITY_NETWORK_UNAVAILABLE' });
}
function publicClientIp(value) {
  const ip = String(value || '').replace(/^::ffff:/i, '');
  const version = isIP(ip);
  if (version === 4) {
    const [a, b, c] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)) return null;
    return ip;
  }
  // Global unicast only; never identify localhost, private or link-local addresses.
  return version === 6 && /^[23]/.test(ip) && !/^2001:db8:/i.test(ip) ? ip : null;
}
function createNetworkCity({ lookup = lookupGlobalIp, clock = Date.now } = {}) {
  const cache = new Map(), pending = new Map();
  return async function networkCity(clientIp) {
    const ip = publicClientIp(clientIp);
    if (!ip) throw unavailable();
    const id = createHash('sha256').update(ip).digest('hex');
    const saved = cache.get(id);
    if (saved && saved.until > clock()) return saved.location;
    if (pending.has(id)) return pending.get(id);
    const work = (async () => {
      // Domestic IP localization is intentionally disabled: the visitor grants
      // browser location or selects a city; inaccurate IP labels are never used.
      const info = await lookup(ip);
      if (info?.country?.iso_code === 'CN') {
        throw Object.assign(new Error('境内网络不使用 IP 推测城市。请允许此网站使用位置权限，以获取更细致的定位和天气服务；也可手动搜索城市。'), { publicCode: 'CITY_NETWORK_LOCATION_PERMISSION' });
      }
      const location = globalIpCity(info);
      if (!location?.name || location.name === '当前位置附近') throw unavailable();
      if (cache.size >= 256) cache.delete(cache.keys().next().value);
      cache.set(id, { location, until: clock() + 600000 });
      return location;
    })();
    pending.set(id, work);
    try { return await work; } finally { pending.delete(id); }
  };
}
module.exports = { createNetworkCity, publicClientIp };

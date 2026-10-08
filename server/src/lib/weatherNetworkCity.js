const { isIP } = require('node:net');
const { createHash } = require('node:crypto');
const { lookupOfflineIp } = require('./weatherOfflineIp');
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
function createNetworkCity({ searchCities, lookup = lookupOfflineIp, clock = Date.now } = {}) {
  const cache = new Map(), pending = new Map();
  return async function networkCity(clientIp) {
    const ip = publicClientIp(clientIp);
    if (!ip) throw unavailable();
    const id = createHash('sha256').update(ip).digest('hex');
    const saved = cache.get(id);
    if (saved && saved.until > clock()) return saved.location;
    if (pending.has(id)) return pending.get(id);
    const work = (async () => {
      // Resolve IP entirely locally. Map its actual province/city label to the
      // existing cached national city index; never reverse-geocode a country center.
      const info = await lookup(ip);
      if (info?.countryCode !== 'CN' || !info.province || !info.city || info.province === '0' || info.city === '0') throw unavailable();
      const cities = await searchCities(info.province + info.city);
      const label = value => String(value || '').replace(/省|市|地区|自治州/g, '');
      const location = cities.find(city => label(city.name) === label(info.city) && label(city.region).includes(label(info.province)));
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

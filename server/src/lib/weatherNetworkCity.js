const { isIP } = require('node:net');
const { createHash } = require('node:crypto');
const { requestAmap } = require('./weatherAmap');
const { parseLocation } = require('./weatherLocation');
const { gcj02towgs84 } = require('../vendor/coordtransform');
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
function createNetworkCity({ fetchImpl = fetch, reverseGeocode, lookup = ip => require('geoip-lite').lookup(ip), clock = Date.now } = {}) {
  const cache = new Map(), pending = new Map();
  return async function networkCity(clientIp) {
    const ip = publicClientIp(clientIp);
    if (!ip) throw unavailable();
    const id = createHash('sha256').update(ip).digest('hex');
    const saved = cache.get(id);
    if (saved && saved.until > clock()) return saved.location;
    if (pending.has(id)) return pending.get(id);
    const work = (async () => {
      let location;
      if (isIP(ip) === 4) {
        // Always use the trusted visitor address, never Amap's implicit server IP.
        const body = await requestAmap('ip', { ip }, { key: process.env.AMAP_WEB_SERVICE_KEY, fetchImpl });
        const city = typeof body.city === 'string' ? body.city.trim() : '';
        const points = typeof body.rectangle === 'string' ? body.rectangle.split(';').map(point => point.split(',').map(Number)) : [];
        if (city && /^\d{6}$/.test(body.adcode || '') && points.length === 2 && points.every(point => point.length === 2 && point.every(Number.isFinite))) {
          const [longitude, latitude] = gcj02towgs84((points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2);
          location = parseLocation({ name: city, region: body.province === city ? '中国' : `中国 · ${body.province}`, countryCode: 'CN', adcode: body.adcode, provider: 'amap', latitude, longitude });
        }
      }
      if (!location) {
        const info = lookup(ip);
        if (info?.country !== 'CN' || !Array.isArray(info.ll) || info.ll.length !== 2) throw unavailable();
        location = await reverseGeocode({ latitude: info.ll[0], longitude: info.ll[1] });
      }
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

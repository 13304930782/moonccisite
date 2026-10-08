const fs = require('node:fs');
const path = require('node:path');
const { Reader } = require('../../vendor/mmdb-lib/lib');
const { parseLocation } = require('./weatherLocation');
let reader;
function lookupGlobalIp(ip) {
  reader ||= new Reader(fs.readFileSync(path.join(__dirname, '../../data/dbip/dbip-city-lite-2026-10.mmdb')));
  return reader.get(ip);
}
function globalIpCity(info) {
  const code = info?.country?.iso_code;
  const name = info?.city?.names?.['zh-CN'] || info?.city?.names?.en;
  if (!/^[A-Z]{2}$/.test(code || '') || code === 'CN' || !name) return null;
  const location = info?.location;
  if (!Number.isFinite(location?.latitude) || !Number.isFinite(location?.longitude)) return null;
  return parseLocation({
    name, countryCode: code, provider: 'dbip',
    region: [...new Set([info.country.names?.['zh-CN'] || info.country.names?.en, ...(info.subdivisions || []).map(p => p.names?.['zh-CN'] || p.names?.en)].filter(Boolean))].join(' · '),
    latitude: location.latitude, longitude: location.longitude,
  });
}
module.exports = { lookupGlobalIp, globalIpCity };

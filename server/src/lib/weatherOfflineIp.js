const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isIP } = require('node:net');
let binding, searchers = new Map();
async function lookupOfflineIp(ip) {
  const family = isIP(ip);
  if (![4, 6].includes(family)) return null;
  binding ||= import(pathToFileURL(path.join(__dirname, '../../vendor/ip2region/index.js')).href);
  const xdb = await binding;
  if (!searchers.has(family)) {
    const file = path.join(__dirname, `../../data/ip2region/ip2region_v${family}.xdb`);
    xdb.verifyFromFile(file);
    searchers.set(family, xdb.newWithVectorIndex(family === 4 ? xdb.IPv4 : xdb.IPv6, file, xdb.loadVectorIndexFromFile(file)));
  }
  const raw = await searchers.get(family).search(ip);
  const [country, province, city, , countryCode] = raw.split('|');
  const known = value => typeof value === 'string' && value.trim() && value !== '0';
  // Country/province-only records are not a city, and have no usable GPS point.
  if (!known(country) || !known(province) || !known(city) || countryCode !== 'CN') return null;
  return { countryCode, province: province.trim(), city: city.trim() };
}
module.exports = { lookupOfflineIp };

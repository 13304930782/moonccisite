// Scope follows provider coverage, not visitor IP, browser language or server location.
const mainlandPrefixes = new Set([
  '11',
  '12',
  '13',
  '14',
  '15',
  '21',
  '22',
  '23',
  '31',
  '32',
  '33',
  '34',
  '35',
  '36',
  '37',
  '41',
  '42',
  '43',
  '44',
  '45',
  '46',
  '50',
  '51',
  '52',
  '53',
  '54',
  '61',
  '62',
  '63',
  '64',
  '65',
]);
function mainlandAdcode(value) {
  return (
    typeof value === 'string' &&
    /^\d{6}$/.test(value) &&
    mainlandPrefixes.has(value.slice(0, 2))
  );
}
function weatherSource(location) {
  if (!location) return null;
  if (mainlandAdcode(location.adcode)) return 'amap';
  if (
    /^(71|81|82)\d{4}$/.test(location.adcode || '') ||
    /香港|澳门|澳門|台湾|臺灣|Hong Kong|Macau|Macao|Taiwan/i.test(
      location.region + ' ' + location.name,
    )
  )
    return 'open-meteo';
  if (location.countryCode)
    return location.countryCode === 'CN' ? 'amap' : 'open-meteo';
  if (
    location.provider === 'amap' ||
    /(?:中国|中國|China)(?:$|[ ·,])/i.test(location.region || '')
  )
    return 'amap';
  // Legacy named foreign selections can be reused. An unnamed coordinate must be resolved first.
  return location.region ? 'open-meteo' : null;
}
module.exports = { weatherSource, mainlandAdcode };

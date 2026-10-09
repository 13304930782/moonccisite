const { createReverseGeocoder, normalizeAddress } = require('./weatherReverseGeocode');
function normalizePhoton(body, location) {
  for (const feature of Array.isArray(body?.features) ? body.features : []) {
    const p = feature?.properties || {};
    const name = p.city || (['city', 'town', 'village', 'municipality'].includes(p.osm_value) ? p.name : '');
    if (!name || !/^[A-Z]{2}$/i.test(p.countrycode || '')) continue;
    return {
      ...normalizeAddress({ address: { city: name, state: p.state, country: p.country, country_code: p.countrycode.toLowerCase() } }, location),
      provider: 'photon',
    };
  }
  throw Object.assign(new Error('暂未识别出该坐标对应的城市，请重试。'), { publicCode: 'CITY_NO_CITY' });
}
function createPhotonGeocoder(options) {
  return createReverseGeocoder({
    ...options,
    endpoint: () => 'https://photon.komoot.io/reverse',
    provider: 'photon',
    reverseParameters: location => ({ lat: String(location.latitude), lon: String(location.longitude), limit: '3', lang: 'en' }),
    normalizeReverse: normalizePhoton,
  });
}
module.exports = { createPhotonGeocoder, normalizePhoton };

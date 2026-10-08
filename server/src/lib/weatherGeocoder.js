const { createReverseGeocoder } = require('./weatherReverseGeocode');
const { createAmapGeocoder } = require('./weatherAmap');
const { createPhotonGeocoder } = require('./weatherPhoton');
const { parseGeocodingLocation } = require('./weatherLocation');
function cityProvider() {
  return (
    process.env.MOONCCI_CITY_PROVIDER ||
    (process.env.AMAP_WEB_SERVICE_KEY ? 'amap' : 'nominatim')
  );
}
function createWeatherGeocoder(options) {
  const nominatim = createReverseGeocoder(options),
    amap = createAmapGeocoder(options),
    photon = createPhotonGeocoder(options);
  async function globalReverse(location) {
    try { return await photon(location); }
    catch (error) {
      if (error.publicCode === 'WEATHER_UPSTREAM_LIMIT') throw error;
      try { return await nominatim(location); }
      catch (fallback) {
        if (fallback.publicCode === 'WEATHER_UPSTREAM_LIMIT') throw fallback;
        throw Object.assign(new Error('该坐标的全球城市识别暂不可用，请重试。'), { publicCode: 'CITY_GLOBAL_UNAVAILABLE' });
      }
    }
  }
  function current() {
    const provider = cityProvider();
    if (provider === 'amap') return amap;
    if (provider === 'nominatim') return nominatim;
    throw Object.assign(new Error('服务器的城市服务配置无效。'), {
      publicCode: 'CITY_PROVIDER_INVALID',
    });
  }
  const reverse = async (input) => {
    const provider = current();
    const location = parseGeocodingLocation(input);
    if (!location) throw Object.assign(new Error('请先获取有效位置。'), { status: 400 });
    // The box only selects request order; it never infers a country or replaces
    // coordinates. Valid browser coordinates, including extension overrides, win.
    if (provider === amap && (location.longitude < 72 || location.longitude > 138 || location.latitude < 0.8 || location.latitude > 56)) return globalReverse(location);
    try {
      return await provider(location);
    } catch (error) {
      if (provider !== amap || error.publicCode !== 'AMAP_NO_CITY') throw error;
      return globalReverse(location);
    }
  };
  reverse.search = (query) => current().search(query);
  return reverse;
}
module.exports = { createWeatherGeocoder, cityProvider };

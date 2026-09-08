const { createReverseGeocoder } = require('./weatherReverseGeocode');
const { createAmapGeocoder } = require('./weatherAmap');
function cityProvider() {
  return (
    process.env.MOONCCI_CITY_PROVIDER ||
    (process.env.AMAP_WEB_SERVICE_KEY ? 'amap' : 'nominatim')
  );
}
function createWeatherGeocoder(options) {
  const nominatim = createReverseGeocoder(options),
    amap = createAmapGeocoder(options);
  function current() {
    const provider = cityProvider();
    if (provider === 'amap') return amap;
    if (provider === 'nominatim') return nominatim;
    throw Object.assign(new Error('服务器的城市服务配置无效。'), {
      publicCode: 'CITY_PROVIDER_INVALID',
    });
  }
  const reverse = (input) => current()(input);
  reverse.search = (query) => current().search(query);
  return reverse;
}
module.exports = { createWeatherGeocoder, cityProvider };

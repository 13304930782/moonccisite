const crypto = require('crypto');
const { weatherSource } = require('./weatherSource');
function parseLocation(value, precision = 1) {
  if (value == null) return null;
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof value.latitude !== 'number' ||
    !Number.isFinite(value.latitude) ||
    Math.abs(value.latitude) > 90 ||
    typeof value.longitude !== 'number' ||
    !Number.isFinite(value.longitude) ||
    Math.abs(value.longitude) > 180
  ) {
    throw Object.assign(new Error('请选择有效城市或重新定位。'), {
      status: 400,
    });
  }
  const text = (input, fallback, max) =>
    typeof input === 'string' && input.trim()
      ? input
          .replace(/[\u0000-\u001f\u007f]/g, '')
          .trim()
          .slice(0, max)
      : fallback;
  return {
    ...(typeof value.countryCode === 'string' &&
    /^[A-Za-z]{2}$/.test(value.countryCode)
      ? { countryCode: value.countryCode.toUpperCase() }
      : {}),
    ...(typeof value.adcode === 'string' && /^\d{6}$/.test(value.adcode)
      ? { adcode: value.adcode }
      : {}),
    ...(['amap', 'nominatim', 'geonames'].includes(value.provider)
      ? { provider: value.provider }
      : {}),
    name: text(value.name, '当前位置附近', 80),
    region: text(value.region, '', 120),
    latitude: Math.round(value.latitude * 10 ** precision) / 10 ** precision,
    longitude: Math.round(value.longitude * 10 ** precision) / 10 ** precision,
  };
}
// Reverse geocoding must not inherit the much coarser weather cache grid.
function parseGeocodingLocation(value) {
  return parseLocation(value, 3);
}
function locationKey(location) {
  const source = weatherSource(location);
  // Amap forecasts belong to one administrative code, not arbitrary client coordinates.
  const area =
    source === 'amap' && location.adcode
      ? location.adcode
      : `${source === 'amap' ? location.name + '|' + location.region : 'grid'}:${location.latitude.toFixed(1)},${location.longitude.toFixed(1)}`;
  return (
    'weather_mood:v2:' +
    crypto
      .createHash('sha256')
      .update(`regional-v2:${source}:${area}`)
      .digest('hex')
      .slice(0, 32)
  );
}
function normalizeCities(body) {
  return (Array.isArray(body?.results) ? body.results : [])
    .filter((item) => /^PPL/.test(item.feature_code || ''))
    .slice(0, 8)
    .flatMap((item) => {
      try {
        return [
          {
            id: String(item.id),
            ...parseLocation({
              ...item,
              countryCode: item.country_code,
              provider: 'geonames',
              region: [
                ...new Set(
                  [item.country, item.admin1, item.admin2].filter(Boolean),
                ),
              ].join(' · '),
            }),
          },
        ];
      } catch {
        return [];
      }
    });
}
function createCitySearch(fetchImpl = fetch, administrativeSearch = null) {
  const cache = new Map();
  return async function searchCities(input) {
    if (
      typeof input !== 'string' ||
      input.trim().length < 2 ||
      input.trim().length > 80
    )
      throw Object.assign(new Error('请输入 2～80 个字的城市名称。'), {
        status: 400,
      });
    const query = input.trim(),
      key = query.toLowerCase();
    const previous = cache.get(key);
    if (previous?.expires > Date.now()) return previous.promise;
    if (cache.size >= 128) cache.delete(cache.keys().next().value);
    const promise = (async () => {
      // Chinese administrative names (including county-level cities) are incomplete in GeoNames.
      if (administrativeSearch && /[\u3400-\u9fff]/.test(query)) {
        try {
          const places = await administrativeSearch(query);
          if (places.length) return places;
        } catch (error) {
          if (error.publicCode) throw error;
          /* Legacy global search remains available if the optional OSM service fails. */
        }
      }
      const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
      url.search = new URLSearchParams({
        name: query,
        count: '10',
        language: 'zh',
        format: 'json',
      }).toString();
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
      });
      if (!response.ok) throw new Error('CITY_SEARCH_FAILED');
      return normalizeCities(await response.json());
    })().catch((error) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, { promise, expires: Date.now() + 3600000 });
    return promise;
  };
}
module.exports = {
  parseLocation,
  parseGeocodingLocation,
  locationKey,
  normalizeCities,
  createCitySearch,
};

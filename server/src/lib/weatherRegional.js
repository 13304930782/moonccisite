const { requestAmap, createAmapGeocoder } = require('./weatherAmap');
const { weatherSource, mainlandAdcode } = require('./weatherSource');
const {
  fetchForecast,
  businessDate,
  nextDay,
  describeWeather,
} = require('./weatherMood');
function temperature(value) {
  if (
    typeof value !== 'number' &&
    (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(value.trim()))
  )
    return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= -100 && number <= 70
    ? number
    : null;
}
function normalizeAmapForecast(body, now, location) {
  const date = businessDate(now);
  const forecast = body?.forecasts?.find(
    (item) => item.adcode === location.adcode,
  );
  const cast = forecast?.casts?.find((item) => item.date === date);
  const label =
    typeof cast?.dayweather === 'string'
      ? cast.dayweather.trim().slice(0, 30)
      : '';
  if (!label || /未知|不详/.test(label))
    throw Error('AMAP_WEATHER_NO_CURRENT_FORECAST');
  const nightLabel =
    typeof cast.nightweather === 'string'
      ? cast.nightweather.trim().slice(0, 30)
      : '';
  const code = /雷/.test(label)
    ? 95
    : /雪|冰雹/.test(label)
      ? 75
      : /雨/.test(label)
        ? 63
        : /雾|霾/.test(label)
          ? 45
          : /多云/.test(label)
            ? 2
            : /阴/.test(label)
              ? 3
              : /晴/.test(label)
                ? 0
                : null;
  const mood = describeWeather(code);
  let publishedAt = null;
  if (forecast.reporttime) {
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(forecast.reporttime))
      throw Error('AMAP_WEATHER_BAD_TIME');
    const published = Date.parse(
      forecast.reporttime.replace(' ', 'T') + '+08:00',
    );
    if (
      !Number.isFinite(published) ||
      published > now.getTime() + 600000 ||
      now.getTime() - published > 36 * 3600000
    )
      throw Error('AMAP_WEATHER_STALE');
    publishedAt = new Date(published).toISOString();
  }
  return {
    status: 'ready',
    weatherSource: 'amap',
    date,
    city: location,
    timezone: 'Asia/Shanghai',
    weather: {
      code,
      label:
        nightLabel && nightLabel !== label ? `${label}转${nightLabel}` : label,
      min: null,
      max: null,
      dayTemperature: temperature(cast.daytemp),
      nightTemperature: temperature(cast.nighttemp),
    },
    mood: mood
      ? { emotionId: mood.emotionId, name: mood.name, message: mood.message }
      : {
          emotionId: '02',
          name: '放空',
          message: `今天是${label}，安静陪你一会儿。`,
        },
    publishedAt,
    fetchedAt: now.toISOString(),
    refreshAt: nextDay(now),
  };
}
function createRegionalForecast({
  repository,
  fetchImpl = fetch,
  key = () => process.env.AMAP_WEB_SERVICE_KEY,
  resolveCity,
  foreignForecast = fetchForecast,
} = {}) {
  const reverse =
    resolveCity || createAmapGeocoder({ repository, fetchImpl, key });
  return async function fetchRegional(now, location) {
    const source = weatherSource(location);
    if (source === 'open-meteo')
      return foreignForecast(now, location, fetchImpl);
    if (source !== 'amap') throw Error('WEATHER_LOCATION_UNRESOLVED');
    let resolved = location;
    if (!mainlandAdcode(resolved.adcode)) {
      // v7 and earlier stored no administrative code. Prefer exact city search over the coarse grid.
      const matches =
        typeof reverse.search === 'function'
          ? await reverse.search(location.name)
          : [];
      resolved =
        matches.find(
          (item) =>
            item.name === location.name &&
            item.region === location.region &&
            mainlandAdcode(item.adcode),
        ) || (await reverse(location));
    }
    if (!mainlandAdcode(resolved.adcode)) throw Error('AMAP_WEATHER_NO_ADCODE');
    const body = await requestAmap(
      'weather/weatherInfo',
      { city: resolved.adcode, extensions: 'all' },
      { key: key(), fetchImpl },
    );
    return normalizeAmapForecast(body, now, resolved);
  };
}
module.exports = { createRegionalForecast, normalizeAmapForecast, temperature };

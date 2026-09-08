const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLocation, locationKey, createCitySearch } = require('../src/lib/weatherLocation');
const { createWeatherMoodService } = require('../src/services/weatherMood');
const { businessDate, nextDay, normalizeForecast } = require('../src/lib/weatherMood');
const cityA = parseLocation({ name: '甲城', latitude: 40.61667, longitude: 120.71667 });
const cityB = parseLocation({ name: '乙城', latitude: 30.27, longitude: 120.15 });
test('location validation discards exact coordinates and rejects bad values before upstream requests', async () => {
  assert.equal(cityA.latitude, 40.6); assert.equal(cityA.longitude, 120.7);
  assert.equal(parseLocation(null), null);
  for (const input of [{}, [], { latitude: '0', longitude: 0 }, { latitude: null, longitude: null }, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: Infinity }]) assert.throws(() => parseLocation(input), { status: 400 });
  assert.equal(parseLocation({ latitude: 0, longitude: 0 }).latitude, 0);
  assert.equal(locationKey(cityA), locationKey({ ...cityA, name: '另一个名称' }));
  assert.notEqual(locationKey(cityA), locationKey(cityB));
  const { normalizeWeatherLocation } = await import('../../src/app/lib/weatherLocation.ts');
  assert.deepEqual(normalizeWeatherLocation({ name: '甲城', latitude: 40.61667, longitude: 120.71667 }), cityA);
  assert.equal(normalizeWeatherLocation({ latitude: null, longitude: null }), null);
});
test('no selected city never queries an arbitrary default city', async () => {
  const get = createWeatherMoodService({ repository: { withLock: () => { throw Error('must not use database'); } }, fetchWeather: () => { throw Error('must not call weather'); } });
  const result = await get();
  assert.equal(result.status, 'needs_location'); assert.equal(result.city, null); assert.equal(result.weather, null);
});
test('per-location single-flight and persisted cache isolate cities and labels', async () => {
  const states = new Map();
  const now = new Date('2026-09-08T12:00:00+08:00');
  const requests = [];
  const options = { clock: () => now, repository: { withLock: async (key, callback) => callback(states.get(key) || {}, async value => states.set(key, value)) },
    fetchWeather: async (date, location) => {
      requests.push(location.latitude);
      return normalizeForecast({ timezone: 'Asia/Shanghai', daily: { time: [businessDate(date)], weather_code: [location.latitude === cityA.latitude ? 0 : 63] } }, date, location);
    } };
  const get = createWeatherMoodService(options);
  const [a, b, anotherA] = await Promise.all([get(cityA), get(cityB), get({ ...cityA, name: '我的附近' })]);
  assert.equal(requests.length, 2);
  assert.equal(a.weather.label, '晴'); assert.equal(b.weather.label, '雨');
  assert.equal(anotherA.city.name, '我的附近'); assert.equal(a.city.name, '甲城');
  for (const value of states.values()) assert.equal(value.snapshot.city.name, undefined);
  const restart = createWeatherMoodService(options);
  assert.equal((await restart(cityB)).weather.label, '雨'); assert.equal(requests.length, 2);
});
test('forecast uses selected location timezone including DST midnight and local date', () => {
  const now = new Date('2026-09-08T02:00:00Z');
  const result = normalizeForecast({ timezone: 'America/New_York', daily: { time: ['2026-09-07'], weather_code: [2] } }, now, cityA);
  assert.equal(result.date, '2026-09-07');
  assert.equal(result.refreshAt, '2026-09-08T04:00:00.000Z');
  const spring = new Date('2026-03-08T05:00:00Z');
  assert.equal(Date.parse(nextDay(spring, 'America/New_York')) - spring.getTime(), 23 * 3600000);
});
test('city search returns selectable city labels, rounds coordinates, caches repeated searches and surfaces failure', async () => {
  let calls = 0;
  const search = createCitySearch(async (url, options) => {
    calls++; assert.equal(url.hostname, 'geocoding-api.open-meteo.com'); assert.equal(url.searchParams.get('name'), '测试城'); assert.ok(options.signal);
    return { ok: true, json: async () => ({ results: [
      { id: 1, feature_code: 'PPL', name: '测试城', country: '中国', admin1: '甲省', latitude: 30.123456, longitude: 120.123456 },
      { id: 2, feature_code: 'PPL', name: '测试城', country: '中国', admin1: '乙省', latitude: 40.123456, longitude: 120.123456 },
      { id: 3, feature_code: 'AIRP', name: '同名机场', latitude: 30, longitude: 120 },
    ] }) };
  });
  const results = await search('测试城');
  assert.equal(results.length, 2); assert.equal(results[0].latitude, 30.1);
  assert.notEqual(results[0].region, results[1].region);
  await search('测试城'); assert.equal(calls, 1);
  await assert.rejects(search('a'), { status: 400 });
  await assert.rejects(createCitySearch(async () => ({ ok: false }))('测试城'));
});

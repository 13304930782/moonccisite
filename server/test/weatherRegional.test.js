const test = require('node:test');
const assert = require('node:assert/strict');
const { weatherSource } = require('../src/lib/weatherSource');
const {
  normalizeAmapForecast,
  createRegionalForecast,
} = require('../src/lib/weatherRegional');
const { parseLocation, locationKey } = require('../src/lib/weatherLocation');
const now = new Date('2026-09-08T10:00:00+08:00');
const cn = {
  name: '沈北新区',
  region: '中国 · 辽宁省 · 沈阳市',
  latitude: 41.9,
  longitude: 123.4,
  adcode: '210113',
  countryCode: 'CN',
  provider: 'amap',
};
const body = () => ({
  status: '1',
  forecasts: [
    {
      adcode: '210113',
      reporttime: '2026-09-08 08:00:00',
      casts: [
        {
          date: '2026-09-08',
          dayweather: '晴',
          nightweather: '多云',
          daytemp: '25',
          nighttemp: '0',
        },
      ],
    },
  ],
});
test('forecast routing uses selected administrative identity, including foreign cities near China and separate coverage for HK/MO/TW', () => {
  assert.equal(weatherSource(cn), 'amap');
  assert.equal(
    weatherSource({ ...cn, adcode: undefined, countryCode: undefined }),
    'amap',
  );
  for (const code of ['JP', 'KR', 'VN', 'RU', 'US'])
    assert.equal(
      weatherSource({
        name: 'Foreign city',
        region: 'Foreign',
        countryCode: code,
        latitude: 35,
        longitude: 125,
      }),
      'open-meteo',
    );
  for (const code of ['810000', '820000', '710000'])
    assert.equal(weatherSource({ ...cn, adcode: code }), 'open-meteo');
  assert.equal(
    weatherSource({
      latitude: 35,
      longitude: 120,
      name: '当前位置附近',
      region: '',
    }),
    null,
  );
  assert.notEqual(locationKey(cn), locationKey({ ...cn, adcode: '210105' }));
  assert.notEqual(
    locationKey(cn),
    locationKey({
      ...cn,
      countryCode: 'JP',
      adcode: undefined,
      provider: undefined,
      region: '日本',
    }),
  );
});
test('Amap forecast preserves day/night semantics, missing and zero temperatures, correct time and actual source', () => {
  const result = normalizeAmapForecast(body(), now, cn);
  assert.equal(result.weatherSource, 'amap');
  assert.equal(result.timezone, 'Asia/Shanghai');
  assert.equal(result.weather.dayTemperature, 25);
  assert.equal(result.weather.nightTemperature, 0);
  assert.equal(result.weather.min, null);
  assert.equal(result.weather.max, null);
  assert.equal(result.weather.label, '晴转多云');
  assert.equal(result.publishedAt, '2026-09-08T00:00:00.000Z');
  const incomplete = body();
  incomplete.forecasts[0].casts[0].nighttemp = '';
  assert.equal(
    normalizeAmapForecast(incomplete, now, cn).weather.nightTemperature,
    null,
  );
  for (const change of [
    (x) => (x.forecasts[0].casts[0].date = '2026-09-07'),
    (x) => (x.forecasts[0].adcode = '110101'),
    (x) => (x.forecasts[0].reporttime = '2026-09-01 08:00:00'),
  ]) {
    const invalid = body();
    change(invalid);
    assert.throws(() => normalizeAmapForecast(invalid, now, cn));
  }
});
test('mainland forecast contacts only Amap, foreign forecast only Open-Meteo, and mainland outages never silently fall back', async () => {
  let amapCalls = 0,
    foreignCalls = 0;
  const fetch = createRegionalForecast({
    key: () => 'private-qa-key',
    fetchImpl: async (url) => {
      amapCalls++;
      assert.equal(url.origin, 'https://restapi.amap.com');
      assert.equal(url.pathname, '/v3/weather/weatherInfo');
      assert.equal(url.searchParams.get('city'), '210113');
      assert.equal(url.searchParams.get('extensions'), 'all');
      return { ok: true, json: async () => body() };
    },
    foreignForecast: async () => {
      foreignCalls++;
      return { weatherSource: 'open-meteo' };
    },
  });
  const result = await fetch(now, cn);
  assert.equal(result.weatherSource, 'amap');
  assert.doesNotMatch(JSON.stringify(result), /private-qa-key/);
  await fetch(now, {
    ...cn,
    countryCode: 'JP',
    adcode: undefined,
    provider: undefined,
    region: '日本',
  });
  assert.equal(amapCalls, 1);
  assert.equal(foreignCalls, 1);
  await assert.rejects(
    createRegionalForecast({
      key: () => 'private-qa-key',
      fetchImpl: async () => {
        throw Error('private-qa-key');
      },
      foreignForecast: async () => {
        throw Error('must never fallback');
      },
    })(now, cn),
    (error) =>
      error.publicCode === 'AMAP_NETWORK' &&
      !error.message.includes('private-qa-key'),
  );
});
test('legacy city selection obtains adcode from exact administrative search, while new metadata survives persistence', async () => {
  let reverseCalls = 0;
  const reverse = async () => {
    reverseCalls++;
    return cn;
  };
  reverse.search = async () => [cn];
  const fetch = createRegionalForecast({
    resolveCity: reverse,
    key: () => 'test',
    fetchImpl: async () => ({ ok: true, json: async () => body() }),
  });
  const result = await fetch(now, {
    ...cn,
    adcode: undefined,
    countryCode: undefined,
  });
  assert.equal(result.weatherSource, 'amap');
  assert.equal(reverseCalls, 0);
  const { normalizeWeatherLocation, saveWeatherLocation, readWeatherLocation } =
    await import('../../src/app/lib/weatherLocation.ts');
  const normalized = normalizeWeatherLocation(cn);
  assert.deepEqual(normalized, parseLocation(cn));
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  saveWeatherLocation(normalized, 'manual', 1000, storage);
  assert.equal(readWeatherLocation(2000, storage).location.adcode, '210113');
  assert.equal(readWeatherLocation(2000, storage).location.countryCode, 'CN');
});
test('regional source caches survive restart, separate nearby districts, and preserve failure throttling', async () => {
  const { createWeatherMoodService } = require('../src/services/weatherMood');
  let calls = 0;
  const states = new Map();
  const repository = {
    withLock: async (key, fn) =>
      fn(states.get(key) || {}, async (value) => states.set(key, value)),
  };
  const fetchWeather = async (time, location) => {
    calls++;
    const fixture = body();
    fixture.forecasts[0].adcode = location.adcode;
    return normalizeAmapForecast(fixture, time, location);
  };
  const options = { repository, clock: () => now, fetchWeather };
  const get = createWeatherMoodService(options);
  await Promise.all([get(cn), get(cn)]);
  assert.equal(calls, 1);
  await createWeatherMoodService(options)(cn);
  assert.equal(calls, 1);
  await get({ ...cn, adcode: '210105' });
  assert.equal(calls, 2);
  const failOptions = {
    repository: {
      withLock: async (key, fn) =>
        fn(states.get(key) || {}, async (value) => states.set(key, value)),
    },
    clock: () => now,
    fetchWeather: async () => {
      calls++;
      throw Error('upstream');
    },
  };
  const failedLocation = { ...cn, adcode: '110101' };
  assert.equal(
    (await createWeatherMoodService(failOptions)(failedLocation)).status,
    'unavailable',
  );
  await createWeatherMoodService(failOptions)(failedLocation);
  assert.equal(calls, 3);
});

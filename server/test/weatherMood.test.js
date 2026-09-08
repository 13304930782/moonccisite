const TEST_LOCATION = {
  name: '测试城市',
  region: '',
  latitude: 40.6,
  longitude: 120.7,
};
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  businessDate,
  nextDay,
  normalizeForecast,
  describeWeather,
  fetchForecast,
} = require('../src/lib/weatherMood');
const { createWeatherMoodService } = require('../src/services/weatherMood');
const {
  parseOverride,
  activeOverride,
  applyOverride,
} = require('../src/lib/weatherMood');
test('manual mood defaults to 24 hours, validates duration and restores weather at exact expiry', () => {
  const now = new Date('2026-09-08T12:30:00+08:00');
  const manual = parseOverride({ emotionId: '16' }, now);
  assert.equal(manual.durationDays, 1);
  assert.equal(Date.parse(manual.endsAt) - now.getTime(), 86400000);
  assert.equal(
    parseOverride({ emotionId: '10', durationDays: 3 }, now).durationDays,
    3,
  );
  for (const durationDays of [0, -1, 1.5, 366, '2'])
    assert.throws(() => parseOverride({ emotionId: '10', durationDays }, now));
  assert.throws(() => parseOverride({ emotionId: 'unknown' }, now));
  assert.equal(applyOverride(forecast(now), manual, now).mood.emotionId, '16');
  assert.equal(activeOverride(manual, new Date(manual.endsAt)), null);
  const resumed = applyOverride(
    forecast(new Date(manual.endsAt)),
    manual,
    new Date(manual.endsAt),
  );
  assert.equal(resumed.mode, 'weather');
  assert.notEqual(resumed.mood.emotionId, '16');
});
test('sunny days rotate original compatible emotions; manual choice stays fixed', () => {
  const ids = [];
  for (let i = 0; i < 4; i++) {
    const now = new Date(`2026-09-0${i + 1}T12:00:00+08:00`);
    ids.push(applyOverride(forecast(now, 0), null, now).mood.emotionId);
    assert.equal(
      applyOverride(
        forecast(now, 0),
        parseOverride({ emotionId: '10', durationDays: 7 }, now),
        now,
      ).mood.emotionId,
      '10',
    );
  }
  assert.equal(new Set(ids).size, 4);
});
const forecast = (now, code = 3) =>
  normalizeForecast(
    {
      timezone: 'Asia/Shanghai',
      utc_offset_seconds: 28800,
      daily: {
        time: [businessDate(now)],
        weather_code: [code],
        temperature_2m_min: [0],
        temperature_2m_max: [25],
      },
    },
    now,
  );
function memoryRepository() {
  let state = {},
    locked = false;
  return {
    withLock: async (_key, callback) => {
      if (locked) return null;
      locked = true;
      try {
        return await callback(state, async (value) => {
          state = value;
        });
      } finally {
        locked = false;
      }
    },
  };
}
test('weather interpretation keeps missing/unknown distinct from clear sky and preserves zero temperature', () => {
  const now = new Date('2026-09-08T10:00:00+08:00');
  assert.equal(forecast(now, 0).weather.min, 0);
  assert.equal(describeWeather(0).emotionId, '10');
  assert.equal(describeWeather(3).emotionId, '02');
  assert.equal(describeWeather(63).weather, '雨');
  assert.equal(describeWeather(75).weather, '雪');
  assert.equal(describeWeather(95).emotionId, '13');
  for (const invalid of [null, undefined, '0', 100])
    assert.equal(describeWeather(invalid), null);
  assert.throws(() =>
    normalizeForecast(
      { daily: { time: ['2026-09-07'], weather_code: [0] } },
      now,
    ),
  );
  const missing = normalizeForecast(
    {
      timezone: 'Asia/Shanghai',
      utc_offset_seconds: 28800,
      daily: { time: ['2026-09-08'], weather_code: [2] },
    },
    now,
  );
  assert.equal(missing.weather.min, null);
});
test('Shanghai date and next refresh cross midnight correctly regardless of server timezone', () => {
  assert.equal(businessDate(new Date('2026-09-08T15:59:59Z')), '2026-09-08');
  assert.equal(businessDate(new Date('2026-09-08T16:00:00Z')), '2026-09-09');
  assert.equal(
    nextDay(new Date('2026-09-08T15:59:59Z')),
    '2026-09-08T16:00:00.000Z',
  );
});
test('parallel visitors and process restarts reuse one daily persisted forecast; next day refreshes', async () => {
  let now = new Date('2026-09-08T12:00:00+08:00'),
    requests = 0;
  const repository = memoryRepository();
  const options = {
    repository,
    clock: () => now,
    fetchWeather: async (date) => {
      requests++;
      return forecast(date);
    },
  };
  const getMood = createWeatherMoodService(options);
  const results = await Promise.all(
    Array.from({ length: 20 }, () => getMood(TEST_LOCATION)),
  );
  assert.equal(requests, 1);
  for (const result of results) assert.deepEqual(result, results[0]);
  await createWeatherMoodService(options)(TEST_LOCATION);
  assert.equal(requests, 1);
  now = new Date('2026-09-09T00:00:01+08:00');
  assert.equal((await getMood(TEST_LOCATION)).date, '2026-09-09');
  assert.equal(requests, 2);
});
test('provider failure never presents yesterday as today and is throttled across process restarts', async () => {
  let now = new Date('2026-09-08T23:59:00+08:00'),
    requests = 0;
  const repository = memoryRepository();
  const options = {
    repository,
    clock: () => now,
    fetchWeather: async (date) => {
      requests++;
      if (requests > 1) throw Error('offline');
      return forecast(date);
    },
  };
  const getMood = createWeatherMoodService(options);
  assert.equal((await getMood(TEST_LOCATION)).status, 'ready');
  now = new Date('2026-09-09T00:00:01+08:00');
  const failed = await getMood(TEST_LOCATION);
  assert.equal(failed.status, 'unavailable');
  assert.equal(failed.weather, null);
  assert.equal(failed.mood, null);
  assert.equal(
    (await createWeatherMoodService(options)(TEST_LOCATION)).status,
    'unavailable',
  );
  assert.equal(requests, 2);
  now = new Date('2026-09-09T00:16:00+08:00');
  await getMood(TEST_LOCATION);
  assert.equal(requests, 3);
});
test('storage failure and disabled feature do not contact weather provider', async () => {
  let requests = 0;
  const fetchWeather = async () => {
    requests++;
  };
  const repository = {
    withLock: async () => {
      throw Error('db unavailable');
    },
  };
  assert.equal(
    (
      await createWeatherMoodService({ repository, fetchWeather })(
        TEST_LOCATION,
      )
    ).status,
    'unavailable',
  );
  assert.equal(
    (
      await createWeatherMoodService({
        repository,
        fetchWeather,
        enabled: () => false,
      })(TEST_LOCATION)
    ).status,
    'disabled',
  );
  assert.equal(requests, 0);
});
test('request targets the selected location coordinates and daily forecast with a timeout', async () => {
  const now = new Date('2026-09-08T08:00:00+08:00');
  const result = await fetchForecast(
    now,
    TEST_LOCATION,
    async (url, options) => {
      assert.equal(url.hostname, 'api.open-meteo.com');
      assert.equal(url.searchParams.get('latitude'), '40.6');
      assert.equal(url.searchParams.get('longitude'), '120.7');
      assert.equal(url.searchParams.get('timezone'), 'auto');
      assert.equal(url.searchParams.get('forecast_days'), '1');
      assert.ok(options.signal instanceof AbortSignal);
      return {
        ok: true,
        json: async () => ({
          timezone: 'Asia/Shanghai',
          utc_offset_seconds: 28800,
          daily: { time: ['2026-09-08'], weather_code: [0] },
        }),
      };
    },
  );
  assert.equal(result.status, 'ready');
});

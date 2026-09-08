const test = require('node:test');
const assert = require('node:assert/strict');
function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
}
const city = {
  name: '沈北新区',
  region: '中国 · 辽宁省 · 沈阳市',
  provider: 'amap',
  latitude: 41.9,
  longitude: 123.4,
};
test('manual choice survives reload for exactly 30 days; reading does not renew expiry or use a stale v1 choice', async () => {
  const {
    saveWeatherLocation,
    readWeatherLocation,
    WEATHER_LOCATION_TTL,
    LEGACY_WEATHER_LOCATION_KEY,
  } = await import('../../src/app/lib/weatherLocation.ts');
  const storage = memoryStorage(),
    now = 100000;
  assert.equal(saveWeatherLocation(city, 'manual', now, storage), true);
  // Simulate an old tab writing its previous location after the manual choice.
  storage.setItem(
    LEGACY_WEATHER_LOCATION_KEY,
    JSON.stringify({ ...city, name: '皇姑区' }),
  );
  const restored = readWeatherLocation(now + WEATHER_LOCATION_TTL - 1, storage);
  assert.deepEqual(restored.location, city);
  assert.equal(restored.source, 'manual');
  assert.equal(restored.expiresAt, now + WEATHER_LOCATION_TTL);
  assert.equal(readWeatherLocation(now + WEATHER_LOCATION_TTL, storage), null);
});
test('existing named cities migrate once; explicit clear cannot resurrect legacy data', async () => {
  const {
    saveWeatherLocation,
    readWeatherLocation,
    WEATHER_LOCATION_TTL,
    LEGACY_WEATHER_LOCATION_KEY,
  } = await import('../../src/app/lib/weatherLocation.ts');
  const storage = memoryStorage();
  storage.setItem(LEGACY_WEATHER_LOCATION_KEY, JSON.stringify(city));
  assert.equal(readWeatherLocation(1000, storage).source, 'legacy');
  assert.equal(
    readWeatherLocation(2000, storage).expiresAt,
    1000 + WEATHER_LOCATION_TTL,
  );
  assert.equal(saveWeatherLocation(null, 'manual', 3000, storage), true);
  storage.setItem(LEGACY_WEATHER_LOCATION_KEY, JSON.stringify(city));
  assert.equal(readWeatherLocation(4000, storage), null);
});
test('blocked, corrupt or invalid storage is handled without falsely claiming persistence', async () => {
  const { saveWeatherLocation, readWeatherLocation, WEATHER_LOCATION_KEY } =
    await import('../../src/app/lib/weatherLocation.ts');
  const broken = {
    getItem: () => {
      throw Error('SecurityError');
    },
    setItem: () => {
      throw Error('QuotaExceeded');
    },
  };
  assert.equal(saveWeatherLocation(city, 'manual', 1000, broken), false);
  assert.equal(readWeatherLocation(1000, broken), null);
  const storage = memoryStorage();
  storage.setItem(WEATHER_LOCATION_KEY, '{');
  assert.equal(readWeatherLocation(1000, storage), null);
  assert.equal(
    saveWeatherLocation({ ...city, latitude: NaN }, 'manual', 1000, storage),
    false,
  );
  assert.equal(
    saveWeatherLocation(city, 'manual', 1000, {
      ...storage,
      setItem: () => {},
    }),
    false,
  );
});

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createAmapGeocoder,
  districtIndex,
  searchDistrictIndex,
  requestAmap,
  reverseAddress,
} = require('../src/lib/weatherAmap');
const { wgs84togcj02, gcj02towgs84 } = require('../src/vendor/coordtransform');
const tree = {
  status: '1',
  districts: [
    {
      name: '中国',
      level: 'country',
      districts: [
        {
          name: '辽宁省',
          level: 'province',
          districts: [
            {
              name: '葫芦岛市',
              level: 'city',
              adcode: '211400',
              center: '120.8,40.7',
              districts: [
                {
                  name: '兴城市',
                  level: 'district',
                  adcode: '211481',
                  center: '120.71,40.62',
                  districts: [],
                },
              ],
            },
          ],
        },
        {
          name: '北京市',
          level: 'province',
          adcode: '110000',
          center: '116.4,39.9',
          districts: [
            {
              name: '朝阳区',
              level: 'district',
              adcode: '110105',
              center: '116.5,39.9',
            },
          ],
        },
        {
          name: '吉林省',
          level: 'province',
          districts: [
            {
              name: '长春市',
              level: 'city',
              adcode: '220100',
              center: '125.3,43.8',
              districts: [
                {
                  name: '朝阳区',
                  level: 'district',
                  adcode: '220104',
                  center: '125.3,43.8',
                },
                {
                  name: '同名街道',
                  level: 'street',
                  adcode: '220104',
                  center: '125.3,43.8',
                },
              ],
            },
          ],
        },
        {
          name: '福建省',
          level: 'province',
          districts: [
            {
              name: '长汀县',
              level: 'district',
              adcode: '350821',
              center: '116.4,25.8',
            },
          ],
        },
      ],
    },
  ],
};
function memoryRepository() {
  let state = {};
  return {
    withLock: async (_key, fn) =>
      fn(state, async (value) => {
        state = value;
      }),
    state: () => state,
  };
}
test('Amap administrative index preserves county-level cities, prefectures, municipalities and same-name districts', () => {
  const index = districtIndex(tree);
  assert.equal(
    searchDistrictIndex(index, '兴城市')[0].region,
    '中国 · 辽宁省 · 葫芦岛市',
  );
  assert.equal(searchDistrictIndex(index, '辽宁省兴城市')[0].name, '兴城市');
  assert.equal(searchDistrictIndex(index, '辽宁兴城')[0].name, '兴城市');
  assert.equal(searchDistrictIndex(index, '长汀')[0].name, '长汀县');
  assert.equal(searchDistrictIndex(index, '北京')[0].name, '北京市');
  const duplicates = searchDistrictIndex(index, '朝阳区');
  assert.equal(duplicates.length, 2);
  assert.notEqual(duplicates[0].id, duplicates[1].id);
  assert.ok(duplicates.some((x) => x.region.includes('长春市')));
  assert.ok(duplicates.some((x) => x.region.includes('北京市')));
  assert.equal(
    index.some((x) => x.name === '同名街道'),
    false,
  );
  assert.deepEqual(
    districtIndex({
      districts: [
        { level: 'district', name: '坏数据', adcode: '123456', center: '' },
      ],
    }),
    [],
  );
});
test('coordinate transform matches published vectors and keeps city requests distinct from stored WGS84 weather coordinates', async () => {
  const expected = [116.41024449916938, 39.91640428150164];
  const converted = wgs84togcj02(116.404, 39.915);
  converted.forEach((value, i) =>
    assert.ok(Math.abs(value - expected[i]) < 1e-8),
  );
  const back = gcj02towgs84(...converted);
  assert.ok(Math.abs(back[0] - 116.404) < 0.0001);
  const repository = memoryRepository();
  let calls = 0;
  const geocoder = createAmapGeocoder({
    repository,
    key: () => 'test-key-never-return',
    fetchImpl: async (url) => {
      calls++;
      assert.equal(url.origin, 'https://restapi.amap.com');
      assert.equal(url.pathname, '/v3/geocode/regeo');
      assert.notEqual(url.searchParams.get('location'), '120.7,40.6');
      assert.equal(url.searchParams.get('key'), 'test-key-never-return');
      return {
        ok: true,
        json: async () => ({
          status: '1',
          regeocode: {
            formatted_address: '不要保留街道',
            addressComponent: {
              country: '中国',
              province: '辽宁省',
              city: '葫芦岛市',
              district: '兴城市',
            },
          },
        }),
      };
    },
  });
  const input = { latitude: 40.61678, longitude: 120.71678, name: '私人名称' };
  const result = await geocoder(input);
  await geocoder(input);
  assert.equal(calls, 1);
  assert.equal(result.name, '兴城市');
  assert.equal(result.provider, 'amap');
  assert.equal(result.latitude, 40.6);
  assert.equal(result.longitude, 120.7);
  assert.doesNotMatch(
    JSON.stringify(repository.state()),
    /test-key|私人名称|不要保留街道/,
  );
  assert.equal(
    reverseAddress(
      {
        regeocode: {
          addressComponent: {
            province: '北京市',
            city: [],
            district: '朝阳区',
          },
        },
      },
      input,
    ).region,
    '中国 · 北京市',
  );
});
test('Amap loads country administrative tree once for concurrent searches; quota failures stay actionable and never expose Key', async () => {
  let calls = 0;
  const geocoder = createAmapGeocoder({
    repository: memoryRepository(),
    key: () => 'private-key',
    fetchImpl: async (url) => {
      calls++;
      assert.equal(url.pathname, '/v3/config/district');
      assert.equal(url.searchParams.get('subdistrict'), '3');
      return { ok: true, json: async () => tree };
    },
  });
  await Promise.all([geocoder.search('兴城'), geocoder.search('朝阳区')]);
  await geocoder.search('长汀县');
  assert.equal(calls, 1);
  await assert.rejects(requestAmap('config/district', {}, { key: '' }), {
    publicCode: 'AMAP_KEY_MISSING',
  });
  await assert.rejects(
    requestAmap(
      'geocode/regeo',
      {},
      {
        key: 'private-key',
        fetchImpl: async () => ({
          ok: true,
          json: async () => ({
            status: '0',
            infocode: '10009',
            info: 'private-key',
          }),
        }),
      },
    ),
    (error) => {
      assert.equal(error.publicCode, 'AMAP_10009');
      assert.match(error.message, /Web 服务/);
      assert.doesNotMatch(error.message, /private-key/);
      return true;
    },
  );
  await assert.rejects(
    requestAmap(
      'geocode/regeo',
      {},
      {
        key: 'private-key',
        fetchImpl: async () => {
          throw Error('https://example/?key=private-key');
        },
      },
    ),
    (error) =>
      error.publicCode === 'AMAP_NETWORK' &&
      !error.message.includes('private-key'),
  );
  const { createCitySearch } = require('../src/lib/weatherLocation');
  const search = createCitySearch(
    async () => {
      throw Error('must not hide Key error with foreign provider');
    },
    async () => {
      throw Object.assign(Error('配置缺失'), {
        publicCode: 'AMAP_KEY_MISSING',
      });
    },
  );
  await assert.rejects(search('兴城'), { publicCode: 'AMAP_KEY_MISSING' });
});
test('old saved placeholder locations request a city name while valid manually selected cities keep their name and attribution', async () => {
  const { needsWeatherCityName, normalizeWeatherLocation } = await import(
    '../../src/app/lib/weatherLocation.ts'
  );
  assert.equal(
    needsWeatherCityName(
      normalizeWeatherLocation({
        name: '当前位置附近',
        latitude: 40.6,
        longitude: 120.7,
      }),
    ),
    true,
  );
  assert.equal(needsWeatherCityName(null), false);
  const chosen = normalizeWeatherLocation({
    name: '兴城市',
    latitude: 40.6,
    longitude: 120.7,
    provider: 'amap',
  });
  assert.equal(needsWeatherCityName(chosen), false);
  assert.equal(chosen.provider, 'amap');
});

test('nearby points in the same weather grid use distinct district lookups and ignore old coarse cache entries', async () => {
  const { parseLocation, locationKey } = require('../src/lib/weatherLocation');
  const { geocodingLocation } = await import(
    '../../src/app/lib/weatherLocation.ts'
  );
  const rawA = { latitude: 41.916789, longitude: 123.416789 };
  const rawB = { latitude: 41.906789, longitude: 123.416789 };
  const a = geocodingLocation(rawA),
    b = geocodingLocation(rawB);
  assert.equal(a.latitude, 41.917);
  assert.equal(locationKey(parseLocation(a)), locationKey(parseLocation(b)));
  let state = {
    places: [
      {
        key: 'amap:41.9,123.4',
        expires: Date.now() + 86400000,
        value: { name: '旧缓存区县', latitude: 41.9, longitude: 123.4 },
      },
    ],
  };
  let calls = 0;
  const lookup = createAmapGeocoder({
    repository: {
      withLock: async (_key, fn) =>
        fn(state, async (value) => {
          state = value;
        }),
    },
    key: () => 'fixture-key',
    fetchImpl: async (url) => {
      const point = calls++ === 0 ? a : b;
      const expected = wgs84togcj02(point.longitude, point.latitude)
        .map((x) => x.toFixed(6))
        .join(',');
      assert.equal(url.searchParams.get('location'), expected);
      return {
        ok: true,
        json: async () => ({
          status: '1',
          regeocode: {
            addressComponent: {
              province: '辽宁省',
              city: '沈阳市',
              district: calls === 1 ? '沈北新区' : '皇姑区',
            },
          },
        }),
      };
    },
  });
  // Mock district boundaries: verifies routing and cache isolation, not actual geography.
  assert.equal((await lookup(a)).name, '沈北新区');
  assert.equal((await lookup(b)).name, '皇姑区');
  assert.equal((await lookup(a)).name, '沈北新区');
  assert.equal(calls, 2);
  assert.doesNotMatch(JSON.stringify(state), /41.916789|123.416789/);
});

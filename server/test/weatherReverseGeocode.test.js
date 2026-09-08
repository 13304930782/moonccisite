const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createReverseGeocoder,
  normalizeAddress,
  CACHE_KEY,
} = require('../src/lib/weatherReverseGeocode');
test('reverse city lookup uses district lookup precision, city-level detail, shared throttle and persistent cache', async () => {
  let state = {},
    now = 200000,
    calls = 0;
  const repository = {
    withLock: async (key, fn) => {
      assert.equal(key, CACHE_KEY);
      return fn(state, async (value) => {
        state = value;
      });
    },
  };
  const fetchImpl = async (url, options) => {
    calls++;
    assert.equal(url.hostname, 'nominatim.openstreetmap.org');
    assert.equal(url.searchParams.get('lat'), calls === 1 ? '40.617' : '30.27');
    assert.equal(url.searchParams.get('zoom'), '12');
    assert.match(options.headers['User-Agent'], /mooncci/);
    assert.ok(options.signal);
    return {
      ok: true,
      json: async () => ({
        address: {
          city: '兴城市',
          state: '辽宁省',
          country: '中国',
          road: '不应保留的街道',
        },
        lat: '99',
      }),
    };
  };
  const options = {
    repository,
    fetchImpl,
    clock: () => now,
    sleep: async (ms) => {
      assert.equal(ms, 1100);
      now += ms;
    },
  };
  const lookup = createReverseGeocoder(options);
  const point = {
    latitude: 40.616789,
    longitude: 120.716789,
    name: '私人昵称',
  };
  const first = await lookup(point);
  assert.equal(first.name, '兴城市');
  assert.equal(first.region, '中国 · 辽宁省');
  assert.equal(first.latitude, 40.6);
  assert.equal(first.longitude, 120.7);
  assert.equal(JSON.stringify(state).includes('私人昵称'), false);
  assert.equal(JSON.stringify(state).includes('街道'), false);
  await createReverseGeocoder(options)(point);
  assert.equal(calls, 1);
  await lookup({ latitude: 30.27, longitude: 120.15 });
  assert.equal(calls, 2);
  await assert.rejects(lookup(null), { status: 400 });
  await assert.rejects(lookup({ latitude: 91, longitude: 0 }), { status: 400 });
});
test('missing city, provider failure and a busy shared lock never invent a city', async () => {
  const point = { latitude: 0, longitude: 0 };
  assert.throws(() =>
    normalizeAddress({ address: { country: '中国', road: '某路' } }, point),
  );
  assert.equal(
    normalizeAddress({ address: { town: '某镇' } }, point).name,
    '某镇',
  );
  await assert.rejects(
    createReverseGeocoder({ repository: { withLock: async () => null } })(
      point,
    ),
  );
  await assert.rejects(
    createReverseGeocoder({
      repository: { withLock: async (_key, fn) => fn({}, async () => {}) },
      fetchImpl: async () => ({ ok: false }),
    })(point),
  );
});

test('county-level city is returned instead of its prefecture and Chinese search does not depend on romanized names', async () => {
  const {
    normalizeAdministrativeCities,
  } = require('../src/lib/weatherReverseGeocode');
  const { createCitySearch } = require('../src/lib/weatherLocation');
  const address = {
    district: '兴城市',
    city: '葫芦岛市',
    state: '辽宁省',
    country: '中国',
    country_code: 'cn',
    suburb: '宁远街道',
  };
  assert.equal(
    normalizeAddress({ address }, { latitude: 40.6, longitude: 120.7 }).name,
    '兴城市',
  );
  const results = normalizeAdministrativeCities([
    {
      category: 'boundary',
      addresstype: 'district',
      osm_type: 'relation',
      osm_id: 1,
      lat: '40.56',
      lon: '120.48',
      address,
    },
    {
      category: 'place',
      addresstype: 'city',
      osm_type: 'node',
      osm_id: 2,
      lat: '40.62',
      lon: '120.71',
      address: { ...address, district: undefined, city: '兴城市' },
    },
    { category: 'place', addresstype: 'suburb', address },
  ]);
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'osm-node-2');
  assert.equal(results[0].longitude, 120.7);
  let called = 0;
  const search = createCitySearch(
    async () => {
      throw Error('should not query incomplete source');
    },
    async (query) => {
      called++;
      assert.equal(query, '兴城市');
      return results;
    },
  );
  assert.equal((await search('兴城市'))[0].name, '兴城市');
  await search('兴城市');
  assert.equal(called, 1);
  const fallback = createCitySearch(
    async () => ({ ok: true, json: async () => ({ results: [] }) }),
    async () => {
      throw Error('offline');
    },
  );
  assert.deepEqual(await fallback('测试市'), []);
});

test('municipalities, ambiguous districts and distant namesakes retain their actual administrative identity', () => {
  const {
    normalizeAdministrativeCities,
  } = require('../src/lib/weatherReverseGeocode');
  const rows = [
    {
      name: '上海市',
      addresstype: 'state',
      category: 'boundary',
      lat: '31.2',
      lon: '121.5',
      address: { state: '上海市', country: '中国', country_code: 'cn' },
    },
    {
      name: '朝阳区',
      addresstype: 'city',
      category: 'place',
      lat: '43.8',
      lon: '125.3',
      address: {
        city: '朝阳区',
        district: '绿园区',
        state: '吉林省',
        country: '中国',
        country_code: 'cn',
      },
    },
    {
      name: '朝阳区',
      addresstype: 'district',
      category: 'boundary',
      lat: '43.7',
      lon: '125.3',
      address: {
        district: '朝阳区',
        city: '长春市',
        state: '吉林省',
        country: '中国',
        country_code: 'cn',
      },
    },
    {
      name: '朝阳区',
      addresstype: 'city',
      category: 'boundary',
      lat: '39.9',
      lon: '116.4',
      address: {
        city: '朝阳区',
        'ISO3166-2-lvl4': 'CN-BJ',
        country: '中国',
        country_code: 'cn',
      },
    },
    {
      name: '新华区',
      addresstype: 'district',
      lat: '38.1',
      lon: '114.5',
      address: { state: '河北省', country: '中国' },
    },
    {
      name: '新华区',
      addresstype: 'district',
      lat: '38.3',
      lon: '116.9',
      address: { state: '河北省', country: '中国' },
    },
  ];
  const results = normalizeAdministrativeCities(rows);
  assert.equal(results.length, 5);
  assert.ok(results.find((x) => x.name === '上海市'));
  assert.equal(
    results.some((x) => x.name === '绿园区'),
    false,
  );
  assert.ok(
    results.find((x) => x.name === '朝阳区' && x.region.includes('长春市')),
  );
  assert.ok(
    results.find((x) => x.name === '朝阳区' && x.region.includes('北京市')),
  );
  assert.equal(results.filter((x) => x.name === '新华区').length, 2);
});

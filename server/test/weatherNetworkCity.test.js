const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createNetworkCity, publicClientIp } = require('../src/lib/weatherNetworkCity');
const { lookupGlobalIp, globalIpCity } = require('../src/lib/weatherGlobalIp');

test('network lookup rejects private, reserved and invalid addresses without identifying the server', async () => {
  for (const ip of ['', '104104.245.13', 'localhost', '127.0.0.1', '::1', '10.2.3.4', '192.168.1.2', '172.20.0.1', '100.64.0.1', '169.254.1.2', '198.18.0.1', '203.0.113.1', '2001:db8::1', 'fe80::1', 'fc00::1']) assert.equal(publicClientIp(ip), null, ip);
  assert.equal(publicClientIp('::ffff:104.245.13.12'), '104.245.13.12');
  await assert.rejects(createNetworkCity({ lookup: () => { throw Error('must not call'); } })('127.0.0.1'), e => e.publicCode === 'CITY_NETWORK_UNAVAILABLE');
});

test('domestic IPv4 and IPv6 request location permission and never return an IP city', async () => {
  const network = createNetworkCity({ lookup: () => ({ country: { iso_code: 'CN' }, city: { names: { en: 'Wrong city' } }, location: { latitude: 0, longitude: 0 } }) });
  for (const ip of ['39.144.58.249', '240e::1']) await assert.rejects(network(ip), e => e.publicCode === 'CITY_NETWORK_LOCATION_PERMISSION' && /位置权限/.test(e.message));
  assert.equal(globalIpCity(lookupGlobalIp('39.144.58.249')), null);
});

test('pinned new database maps user SJC example to San Jose and handles foreign IPv6 entirely offline', async () => {
  const network = createNetworkCity();
  const result = await network('104.245.13.12');
  assert.equal(result.name, 'San Jose');
  assert.equal(result.countryCode, 'US');
  assert.equal(result.provider, 'dbip');
  assert.match(result.region, /California/);
  assert.equal(result.latitude, 37.3); assert.equal(result.longitude, -121.9);
  const ipv6 = await network('2001:4860:4860::8888');
  assert.equal(ipv6.provider, 'dbip'); assert(ipv6.name); assert.notEqual(ipv6.countryCode, 'CN');
});

test('foreign lookups deduplicate requests, cache briefly and retry failures', async () => {
  let calls = 0, now = 0;
  const info = lookupGlobalIp('104.245.13.12');
  const network = createNetworkCity({ clock: () => now, lookup: async () => { calls++; return info; } });
  const [a, b] = await Promise.all([network('104.245.13.12'), network('::ffff:104.245.13.12')]);
  assert.deepEqual(a, b); assert.equal(calls, 1);
  await network('104.245.13.12'); assert.equal(calls, 1);
  now = 600001; await network('104.245.13.12'); assert.equal(calls, 2);
  let failed = true;
  const retry = createNetworkCity({ lookup: () => { if (failed) throw Error('unavailable'); return info; } });
  await assert.rejects(retry('104.245.13.12')); failed = false;
  assert.equal((await retry('104.245.13.12')).name, 'San Jose');
});

test('country-only records and missing coordinates never become a city', async () => {
  for (const info of [null, { country: { iso_code: 'US' }, location: { latitude: 0, longitude: 0 } }, { country: { iso_code: 'US' }, city: { names: { en: 'City' } } }]) {
    assert.equal(globalIpCity(info), null);
    await assert.rejects(createNetworkCity({ lookup: () => info })('104.245.13.12'), e => e.publicCode === 'CITY_NETWORK_UNAVAILABLE');
  }
});

const { test } = require('node:test'), assert = require('node:assert/strict');
const { createNetworkCity, publicClientIp } = require('../src/lib/weatherNetworkCity');
const { groupFor } = require('../src/lib/weatherBudget');
test('network lookup rejects non-public addresses and never silently identifies the server IP', async () => {
  for (const ip of ['', 'localhost', '127.0.0.1', '::1', '10.2.3.4', '192.168.1.2', '172.20.0.1', '100.64.0.1', '169.254.1.2', '198.18.0.1', '203.0.113.1', '2001:db8::1', 'fe80::1', 'fc00::1']) assert.equal(publicClientIp(ip), null, ip);
  assert.equal(publicClientIp('::ffff:114.247.50.2'), '114.247.50.2');
  const lookup = createNetworkCity({ fetchImpl: () => { throw Error('must not call'); } });
  await assert.rejects(lookup('127.0.0.1'), e => e.publicCode === 'CITY_NETWORK_UNAVAILABLE');
  assert.equal(groupFor(new URL('https://restapi.amap.com/v3/ip')), 'amap-lbs');
});
test('IPv4 network city uses explicit visitor IP, shares in-flight calls and expires its bounded cache', async () => {
  const previous = process.env.AMAP_WEB_SERVICE_KEY; process.env.AMAP_WEB_SERVICE_KEY = 'fixture';
  let calls = 0, now = 0;
  const lookup = createNetworkCity({ clock: () => now, fetchImpl: async url => {
    calls++; assert.equal(url.searchParams.get('ip'), '114.247.50.2');
    return Response.json({ status: '1', city: '北京市', province: '北京市', adcode: '110000', rectangle: '116.0,39.6;116.8,40.2' });
  } });
  try {
    const [a, b] = await Promise.all([lookup('114.247.50.2'), lookup('::ffff:114.247.50.2')]);
    assert.equal(calls, 1); assert.deepEqual(a, b); assert.equal(a.name, '北京市'); assert.equal(a.adcode, '110000'); assert.equal(a.provider, 'amap');
    await lookup('114.247.50.2'); assert.equal(calls, 1);
    now = 600001; await lookup('114.247.50.2'); assert.equal(calls, 2);
  } finally { if (previous === undefined) delete process.env.AMAP_WEB_SERVICE_KEY; else process.env.AMAP_WEB_SERVICE_KEY = previous; }
});
test('IPv6 uses local city-level database coordinates; missing coverage is explicit and failures are retryable', async () => {
  let calls = 0;
  const lookup = createNetworkCity({ lookup: () => ({ country: 'CN', ll: [39.9, 116.4] }), reverseGeocode: async location => { calls++; assert.deepEqual(location, { latitude: 39.9, longitude: 116.4 }); if (calls === 1) throw Error('offline'); return { ...location, name: '北京市', region: '中国', countryCode: 'CN', adcode: '110000', provider: 'amap' }; } });
  await assert.rejects(lookup('240e::1')); assert.equal((await lookup('240e::1')).name, '北京市'); assert.equal(calls, 2);
  await assert.rejects(createNetworkCity({ lookup: () => null })('240e::2'), e => e.publicCode === 'CITY_NETWORK_UNAVAILABLE');
});

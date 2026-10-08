const { test } = require('node:test'), assert = require('node:assert/strict');
const { createNetworkCity, publicClientIp } = require('../src/lib/weatherNetworkCity');
const { lookupOfflineIp } = require('../src/lib/weatherOfflineIp');
const city = { name: '沈阳市', region: '中国 · 辽宁省', latitude: 41.8, longitude: 123.4, adcode: '210100', provider: 'amap', countryCode: 'CN' };
test('network lookup rejects non-public addresses and never silently identifies the server IP', async () => {
  for (const ip of ['', 'localhost', '127.0.0.1', '::1', '10.2.3.4', '192.168.1.2', '172.20.0.1', '100.64.0.1', '169.254.1.2', '198.18.0.1', '203.0.113.1', '2001:db8::1', 'fe80::1', 'fc00::1']) assert.equal(publicClientIp(ip), null, ip);
  assert.equal(publicClientIp('::ffff:114.247.50.2'), '114.247.50.2');
  const lookup = createNetworkCity({ lookup: () => { throw Error('must not call'); } });
  await assert.rejects(lookup('127.0.0.1'), e => e.publicCode === 'CITY_NETWORK_UNAVAILABLE');
});
test('offline city labels map to matching province and city, deduplicate requests and expire', async () => {
  let calls = 0, now = 0;
  const lookup = createNetworkCity({ clock: () => now, lookup: async ip => {
    calls++; assert.equal(ip, '114.247.50.2'); return {countryCode:'CN',province:'辽宁省',city:'沈阳市'};
  },searchCities:async query=>{assert.equal(query,'辽宁省沈阳市');return [{...city,name:'沈河区'},city]} });
  try {
    const [a, b] = await Promise.all([lookup('114.247.50.2'), lookup('::ffff:114.247.50.2')]);
    assert.equal(calls, 1); assert.deepEqual(a, b); assert.deepEqual(a, city);
    await lookup('114.247.50.2'); assert.equal(calls, 1);
    now = 600001; await lookup('114.247.50.2'); assert.equal(calls, 2);
  } finally { /* No credentials or raw IP records are saved. */ }
});
test('IPv6 uses offline province/city labels; failures are retryable', async () => {
  let calls = 0;
  const lookup = createNetworkCity({lookup:()=>({countryCode:'CN',province:'辽宁省',city:'沈阳市'}),searchCities:async query=>{calls++;assert.equal(query,'辽宁省沈阳市');if(calls===1)throw Error('offline');return [city]}});
  await assert.rejects(lookup('240e::1')); assert.equal((await lookup('240e::1')).name, '沈阳市'); assert.equal(calls, 2);
  await assert.rejects(createNetworkCity({ lookup: () => null })('240e::2'), e => e.publicCode === 'CITY_NETWORK_UNAVAILABLE');
});
test('country-only records cannot become Zhengzhou; missing city and cross-province matches fail closed',async()=>{
 let searches=0;
 for(const info of [null,{country:'CN',ll:[34.8,113.7]},{countryCode:'CN',province:'辽宁省',city:'0'}])await assert.rejects(createNetworkCity({lookup:()=>info,searchCities:()=>{searches++}})('114.247.50.2'),e=>e.publicCode==='CITY_NETWORK_UNAVAILABLE');
 assert.equal(searches,0);
 await assert.rejects(createNetworkCity({lookup:()=>({countryCode:'CN',province:'辽宁省',city:'沈阳市'}),searchCities:async()=>[{...city,region:'中国 · 河南省'}]})('114.247.50.2'),e=>e.publicCode==='CITY_NETWORK_UNAVAILABLE');
});
test('pinned offline databases open for IPv4 and IPv6 and reject invalid input',async()=>{
 const ipv4=await lookupOfflineIp('114.247.50.2');assert.equal(ipv4?.countryCode,'CN');assert.equal(ipv4?.city,'北京市');
 await lookupOfflineIp('240e::1');assert.equal(await lookupOfflineIp('not-an-ip'),null);
});

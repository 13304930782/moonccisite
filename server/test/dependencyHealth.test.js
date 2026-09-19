const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, X509Certificate } = require('node:crypto');
const { createDependencyHealth } = require('../src/lib/dependencyHealth');
const reply = data => new Response(JSON.stringify(data));
const jwk = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ format: 'jwk' });
const discovery = { jwks_uri: 'https://login.microsoftonline.com/common/discovery/v2.0/keys', authorization_endpoint: 'https://login.microsoftonline.com/auth', token_endpoint: 'https://login.microsoftonline.com/token' };
test('Microsoft checks keys, coalesces concurrent requests and expires cache', async () => {
 let calls = 0, clock = Date.now();
 const check = createDependencyHealth({ now: () => clock, fetcher: async () => reply(++calls % 2 ? discovery : { keys: [{ ...jwk, kid: 'test' }] }) });
 const results = await Promise.all(Array.from({ length: 20 }, () => check('microsoft')));
 assert(results.every(r => r.ok)); assert.equal(calls, 2);
 await check('microsoft'); assert.equal(calls, 2);
 clock += 61000; await check('microsoft'); assert.equal(calls, 4);
});
test('Google requires a valid certificate, not just HTTP 200', async () => {
 const pem = require('node:tls').rootCertificates[0]; const cert = new X509Certificate(pem);
 const check = createDependencyHealth({ now: () => Date.parse(cert.validFrom) + 1000, fetcher: async () => reply({ key: pem }) });
 assert.equal((await check('google')).ok, true);
 const expired = createDependencyHealth({ now: () => Date.parse(cert.validTo) + 1000, fetcher: async () => reply({ key: pem }) });
 assert.equal((await expired('google')).ok, false);
 const invalid = createDependencyHealth({ fetcher: async () => reply({ ok: true }) });
 assert.equal((await invalid('google')).ok, false);
});
test('rejects foreign Microsoft key URLs without following them', async () => {
 let calls = 0;
 const check = createDependencyHealth({ fetcher: async () => { calls++; return reply({ ...discovery, jwks_uri: 'https://example.com/keys' }); } });
 assert.equal((await check('microsoft')).ok, false); assert.equal(calls, 1);
});
test('timeouts and failures are cached and never expose upstream details', async () => {
 let calls = 0;
 const check = createDependencyHealth({ timeout: 10, fetcher: async () => { calls++; return new Promise(() => {}); } });
 assert.equal((await check('google')).ok, false); await check('google'); assert.equal(calls, 1);
 const error = createDependencyHealth({ fetcher: async () => { throw Error('secret-internal-url'); } });
 assert(!JSON.stringify(await error('google')).includes('secret'));
});
test('unknown targets never trigger arbitrary requests', async () => {
 const check = createDependencyHealth({ fetcher: () => { throw Error('must not call'); } });
 assert.equal(await check('https://example.com'), null);
});
test('route uses failure status codes and no-store', async t => {
 const app = require('express')(); app.use('/check', require('../src/routes/dependencyHealth').createRouter(async id => id === 'unknown' ? null : { ok: id === 'up' }));
 const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
 t.after(() => { server.closeAllConnections(); server.close(); });
 for (const [id, status] of [['up',200], ['down',503], ['unknown',404]]) {
   const response = await fetch(`http://127.0.0.1:${server.address().port}/check/${id}`);
   assert.equal(response.status, status); assert.equal(response.headers.get('cache-control'), 'no-store'); await response.text();
 }
});

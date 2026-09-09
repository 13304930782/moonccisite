const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const jwt = require('jsonwebtoken');

test('Google credentials still use CF certificates, configured URL, issuer and audience verification', async t => {
  const https = require('https');
  const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const certificate = keys.publicKey.export({ format: 'pem', type: 'spki' });
  let requested;
  t.mock.method(https, 'get', (url, options, callback) => {
    requested = url; assert.equal(options.timeout, 6000);
    const request = new EventEmitter(); request.destroy = () => {};
    process.nextTick(() => {
      const response = new EventEmitter(); response.statusCode = 200; response.headers = {}; response.setEncoding = () => {};
      callback(response); response.emit('data', JSON.stringify({ fixture: certificate })); response.emit('end');
    });
    return request;
  });
  const token = jwt.sign({ sub: 'google-fixture', email: 'fixture@gmail.com', email_verified: true }, keys.privateKey, { algorithm: 'RS256', keyid: 'fixture', audience: 'original-client', issuer: 'https://accounts.google.com', expiresIn: '5m' });
  for (const proxy of ['', 'https://custom-cf.example.test/google-certs']) {
    process.env.GOOGLE_CERTS_URL = proxy;
    delete require.cache[require.resolve('../src/lib/googleIdentity')];
    const { verifyGoogleCredential } = require('../src/lib/googleIdentity');
    assert.equal((await verifyGoogleCredential(token, 'original-client')).sub, 'google-fixture');
    assert.equal(requested, proxy || 'https://google-certs.mooncci.site/google-certs');
    await assert.rejects(verifyGoogleCredential(token, 'another-client'), /audience/);
  }
});

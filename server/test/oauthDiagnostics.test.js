const test = require('node:test');
const assert = require('node:assert/strict');
const { safeFailure, failureCode } = require('../src/lib/socialProviders');
test('OAuth diagnostics never include arbitrary upstream messages or credentials', () => {
  const error = Object.assign(new Error('secret-token-in-url'), { oauthUpstream: 'secret-token', oauthStatus: 'secret', cause: { message: 'client-secret' } });
  assert.deepEqual(safeFailure(error, 'github', 'exchange', '123456abcdef'), { provider: 'github', stage: 'exchange', reference: '123456abcdef', reason: 'internal_error' });
});
test('OAuth diagnostics retain allowlisted actionable categories', () => {
  const error = Object.assign(new Error('provider_rejected'), { oauthUpstream: 'incorrect_client_credentials', oauthStatus: 401 });
  assert.deepEqual(safeFailure(error, 'github', 'exchange', '123456abcdef'), { provider: 'github', stage: 'exchange', reference: '123456abcdef', reason: 'provider_rejected', http_status: 401, upstream: 'incorrect_client_credentials' });
  assert.equal(failureCode({ cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }), 'provider_network');
  assert.equal(failureCode({ name: 'TimeoutError' }), 'provider_timeout');
  assert.equal(failureCode({ code: 'ER_NO_SUCH_TABLE' }), 'ER_NO_SUCH_TABLE');
});

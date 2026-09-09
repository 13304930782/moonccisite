const test = require('node:test');
const assert = require('node:assert/strict');
test('provider adapters validate identities and use bounded, non-redirecting official requests', async t => {
  process.env.SITE_URL = 'https://mooncci.site';
  const { authorizationUrl, exchange } = require('../src/lib/socialProviders');
  const db = require('../src/db'); t.after(() => db.end());
  const calls = []; let replies = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push([String(url), options]); assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    return new Response(JSON.stringify(replies.shift()), { status: 200 });
  });
  const config = { client_id: 'app123' };
  const url = new URL(authorizationUrl('github', config, 'state123', 'verifier123'));
  assert.equal(url.searchParams.get('state'), 'state123');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  replies = [{ access_token: 'token' }, { id: 123, name: 'Fixture' }, [{ email: 'person@example.test', verified: true, primary: true }]];
  const gh = await exchange('github', config, 'secret', 'code', 'verifier123');
  assert.equal(gh.subject, '123'); assert.equal(gh.emailVerified, true);
  assert.ok(calls[0][1].body.includes('code_verifier=verifier123'));
  replies = [{ access_token: 'token' }, { client_id: 'wrong', openid: 'openid' }];
  await assert.rejects(exchange('qq', config, 'secret', 'code', ''), /mismatch/);
  replies = [{ access_token: 'token', openid: 'first' }, { openid: 'different' }];
  await assert.rejects(exchange('wechat', config, 'secret', 'code', ''), /mismatch/);
  replies = [{ access_token: 'token' }, { id: 321, name: 'Gitee', email: 'unverified@example.test' }];
  const gitee = await exchange('gitee', config, 'secret', 'code', '');
  assert.equal(gitee.emailVerified, false); assert.equal(gitee.email, '');
  replies = [{ access_token: 'token' }, { client_id: 'app123', openid: 'qqid' }, { ret: 0, nickname: 'QQ' }];
  assert.equal((await exchange('qq', config, 'secret', 'code', '')).subject, 'qqid');
});

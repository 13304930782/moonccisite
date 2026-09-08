const test = require('node:test');
const assert = require('node:assert/strict');

test('production middleware: logout survives rate limits, failures have JSON status and media edits require admin', async t => {
  process.env.JWT_SECRET = 'audit-http-fixture-only';
  process.env.COOKIE_SECURE = 'false';
  const db = require('../src/db');
  const user = { id: 987, username: 'audit', email: 'audit@example.test', role: 'editor', status: 'active' };
  let fail = false;
  t.mock.method(db, 'query', async sql => {
    if (fail) throw new Error('fixture database unavailable');
    return /SELECT/.test(sql) ? [[user]] : [{ affectedRows: 1 }];
  });
  const app = require('../src/index');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await db.end(); await require('../src/platformDb').end(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const cookie = `mooncci_token=${require('jsonwebtoken').sign({ id: user.id }, process.env.JWT_SECRET)}`;
  const headers = { Cookie: cookie, 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
  const request = (path, options = {}) => fetch(base + path, { headers, signal: AbortSignal.timeout(5000), ...options });
  for (let i = 0; i < 25; i++) assert.equal((await request('/auth/me')).status, 200);
  assert.equal((await request('/upload/media/not-mine.png', { method: 'DELETE' })).status, 403);
  user.role = 'admin';
  const oversizedEmail = await request('/settings/mail/send-custom', {
    method: 'POST', body: JSON.stringify({ to: 'x@' + '.'.repeat(400000) + ' ', subject: 'fixture', content: 'fixture' }),
  });
  assert.equal(oversizedEmail.status, 400, 'oversized recipient must be rejected before expensive validation or mail delivery');
  user.role = 'editor';
  fail = true;
  assert.equal((await request('/auth/me')).status, 503);
  assert.equal((await request('/settings/site')).status, 500, 'async rejection reaches the JSON error handler');
  assert.equal((await request('/auth/logout', { method: 'POST' })).status, 500, 'failed revocation cannot claim success');
  fail = false;
  const invalid = await request('/auth/reset-password', { method: 'POST', body: '{' });
  assert.equal(invalid.status, 400);
  assert.equal((await request('/missing-api')).status, 404);
  const badPassword = await request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: 'x', password: '123' }) });
  assert.equal(badPassword.status, 400);
  assert.equal((await request('/auth/logout', { method: 'POST', headers: { ...headers, Origin: 'https://evil.invalid' } })).status, 403);
  for (let i = 0; i < 205; i++) await request('/health');
  assert.equal((await request('/health')).status, 429);
  // Every route reported by CodeQL is mounted after the shared /api limiter.
  for (const [method, path] of [
    ['GET', '/upload/media'], ['PUT', '/upload/media/test.png'],
    ['PUT', '/upload/media/test.png/rename'], ['POST', '/upload/media/test.png/recompress'],
    ['GET', '/posts/meta/categories'], ['GET', '/posts/meta/tags'],
    ['GET', '/posts'], ['GET', '/posts/1'], ['POST', '/posts'],
    ['PUT', '/posts/1'], ['DELETE', '/posts/1'],
    ['GET', '/applications/me'], ['POST', '/applications'],
    ['POST', '/settings/mail/send-custom'],
  ]) assert.equal((await request(path, { method })).status, 429, `${method} ${path} must be rate limited`);
  const logout = await request('/auth/logout', { method: 'POST' });
  assert.equal(logout.status, 200, 'logout remains reachable after exhausting global and auth budgets');
  assert.match(logout.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/);
});

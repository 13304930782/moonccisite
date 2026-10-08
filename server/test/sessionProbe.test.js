const test = require('node:test');
const assert = require('node:assert/strict');

test('session probe returns anonymous state without weakening protected auth', async t => {
  process.env.JWT_SECRET = 'session-probe-fixture-only';
  const db = require('../src/db');
  const jwt = require('jsonwebtoken');
  let mode = 'active', queries = 0;
  t.mock.method(db, 'query', async () => {
    queries++;
    if (mode === 'offline') throw Error('database unavailable');
    return [mode === 'revoked' ? [] : [{ id: 1, username: 'fixture', role: 'user', status: mode }]];
  });
  const app = require('express')();
  app.use('/api/auth', require('../src/routes/auth-cookie'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await db.end(); });
  const origin = `http://127.0.0.1:${server.address().port}/api/auth`;
  const get = (path, token) => fetch(origin + path, { headers: token ? { Cookie: `mooncci_token=${token}` } : {} });
  const activeToken = jwt.sign({ id: 1 }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const expiredToken = jwt.sign({ id: 1 }, process.env.JWT_SECRET, { expiresIn: -1 });
  for (const token of [null, 'invalid', expiredToken]) {
    const response = await get('/session', token);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { user: null });
    assert.match(response.headers.get('cache-control'), /private, no-store/);
    assert.match(response.headers.get('vary'), /Cookie/);
    assert.match(response.headers.get('vary'), /Authorization/);
  }
  assert.equal(queries, 0, 'anonymous and invalid JWT probes must not query the database');
  assert.equal((await (await get('/session', activeToken)).json()).user.id, 1);
  for (mode of ['disabled', 'revoked']) {
    assert.deepEqual(await (await get('/session', activeToken)).json(), { user: null });
    assert.equal((await get('/me', activeToken)).status, mode === 'disabled' ? 403 : 401);
  }
  assert.equal((await get('/me')).status, 401);
  mode = 'offline';
  assert.equal((await get('/session', activeToken)).status, 503, 'service failures must not look like logout');
});

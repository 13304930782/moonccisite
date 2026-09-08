const test = require('node:test');
const assert = require('node:assert/strict');

test('logout expires the same HttpOnly cookie as login, is idempotent and auth responses cannot be cached', async (t) => {
  process.env.JWT_SECRET = 'logout-regression-fixture-only';
  process.env.COOKIE_SECURE = 'true';
  const db = require('../src/db');
  const bcrypt = require('bcryptjs');
  const user = { id: 1, username: 'fixture', email: 'logout@example.test', role: 'owner', status: 'active', password_hash: await bcrypt.hash('fixture-password1', 4) };
  t.mock.method(db, 'query', async (sql) => /SELECT/.test(sql) ? [[user]] : [{}]);
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../src/routes/auth-cookie'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await db.end(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const domain of ['', '.mooncci.site']) {
    process.env.COOKIE_DOMAIN = domain;
    const login = await fetch(origin + '/api/auth/login', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({email:user.email,password:'fixture-password1'}),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    const signedIn = await fetch(origin + '/api/auth/me', {headers:{Cookie:cookie.split(';')[0]}});
    assert.equal(signedIn.status, 200);
    assert.match(signedIn.headers.get('cache-control'), /private, no-store/);
    const logout = await fetch(origin + '/api/auth/logout', {method:'POST',headers:{Cookie:cookie.split(';')[0]}});
    assert.equal(logout.status, 200);
    const expired = logout.headers.get('set-cookie');
    assert.match(expired, /^mooncci_token=;/);
    assert.match(expired, /Expires=Thu, 01 Jan 1970/);
    for (const flag of ['Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax']) {
      assert.ok(cookie.includes(flag)); assert.ok(expired.includes(flag));
    }
    assert.equal(expired.includes('Domain=.mooncci.site'), Boolean(domain));
    assert.match(logout.headers.get('cache-control'), /no-store/);
    const after = await fetch(origin + '/api/auth/me');
    assert.equal(after.status, 401);
    assert.match(after.headers.get('cache-control'), /no-store/);
  }
  const repeated = await fetch(origin + '/api/auth/logout', {method:'POST',headers:{Cookie:'mooncci_token=expired'}});
  assert.equal(repeated.status, 200, 'an expired login must still be clearable');
});

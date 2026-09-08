const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

test('real MySQL: logout blocks stolen-cookie replay and password reset invalidates all old sessions atomically',
  { skip: process.env.AUTH_INTEGRATION !== 'true' }, async t => {
    assert.match(process.env.DB_NAME || '', /^mooncci_qa(?:_|$)/);
    assert.equal(process.env.DB_HOST, '127.0.0.1');
    process.env.COOKIE_SECURE = 'false';
    const db = require('../src/db');
    const bcrypt = require('bcryptjs');
    const express = require('express');
    const app = express();
    app.use(express.json());
    app.use('/api/auth', require('../src/routes/auth-cookie'));
    app.use((err, _req, res, _next) => res.status(500).json({ message: 'failure' }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const email = `audit-${crypto.randomUUID()}@example.test`;
    const [created] = await db.query("INSERT INTO users (username,email,password_hash,role,status) VALUES (?,?,?,'user','active')",
      [email.slice(0, 30), email, await bcrypt.hash('AuditPassword1', 4)]);
    t.after(async () => {
      await new Promise(resolve => server.close(resolve));
      await db.query('DELETE FROM auth_invalidations WHERE user_id=?', [created.insertId]);
      await db.query('DELETE FROM password_resets WHERE user_id=?', [created.insertId]);
      await db.query('DELETE FROM users WHERE id=?', [created.insertId]);
      await db.end();
    });
    const base = `http://127.0.0.1:${server.address().port}/api/auth`;
    const request = (path, body, cookie) => fetch(base + path, {
      method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const login = async password => {
      const response = await request('/login', { email, password });
      assert.equal(response.status, 200);
      return response.headers.get('set-cookie').split(';')[0];
    };
    const stolen = await login('AuditPassword1');
    assert.equal((await request('/me', null, stolen)).status, 200);
    assert.equal((await request('/logout', {}, stolen)).status, 200);
    assert.equal((await request('/me', null, stolen)).status, 401, 'replaying the pre-logout cookie fails');
    assert.equal((await request('/logout', {}, stolen)).status, 200);
    const other = await login('AuditPassword1');
    const token = crypto.randomBytes(32).toString('hex');
    await db.query('INSERT INTO password_resets (user_id,token_hash,expires_at) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 30 MINUTE))',
      [created.insertId, crypto.createHash('sha256').update(token).digest('hex')]);
    assert.equal((await request('/reset-password', { token, password: 'weak' })).status, 400);
    assert.equal((await request('/reset-password', { token, password: 'AuditPassword2' })).status, 200);
    assert.equal((await request('/me', null, other)).status, 401);
    assert.equal((await request('/reset-password', { token, password: 'AuditPassword3' })).status, 400);
    assert.equal((await request('/me', null, await login('AuditPassword2'))).status, 200);
  });

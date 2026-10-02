const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

test('owner can connect an existing mailbox without provisioning it; review stays owner-only and bulk rejection is atomic', async t => {
  process.env.JWT_SECRET = 'mailbox-redesign-test-jwt';
  process.env.MAILBOX_SECRET_KEY = crypto.randomBytes(32).toString('hex');
  process.env.MAILBOX_SMTP_HOST = 'smtp.example.invalid';
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const db = require('../src/db');
  const nodemailer = require('nodemailer');
  const { open } = require('../src/lib/mailboxSecurity');
  const owner = { id: 1, username: 'owner', email: 'owner@example.invalid', role: 'owner', status: 'active' };
  const reader = { id: 2, username: 'reader', email: 'reader@example.invalid', role: 'user', status: 'active' };
  let access = { status: 'revoked', mailbox_address: 'codex-test-20261002@mooncci.site' };
  let verified = 0;
  let rejected = false;
  let updatedLimit = null;
  let sent = false;
  let pendingFirst = false;
  t.mock.method(nodemailer, 'createTransport', options => ({
    verify: async () => { assert.equal(options.auth.user, 'mooncci@mooncci.site'); assert.equal(options.auth.pass, 'ExistingPass9!'); verified++; },
    sendMail: async mail => { assert.equal(options.auth.user, 'mooncci@mooncci.site'); assert.equal(mail.from, 'mooncci@mooncci.site'); sent = true; return { accepted: [mail.to] }; },
    close: () => {},
  }));
  t.mock.method(db, 'query', async (sql, params = []) => {
    if (sql.includes('FROM users') && sql.includes('auth_revocations')) return [[Number(params[0]) === 1 ? owner : reader]];
    if (sql.startsWith('SELECT COUNT(*) AS total FROM mailbox_access')) return [[{ total: 2 }]];
    if (sql.startsWith('SELECT m.user_id, u.username')) { pendingFirst ||= sql.includes("CASE WHEN m.status='pending' THEN 0"); return [[{ user_id: 2, username: 'reader', account_email: reader.email,
      requested_local_part: 'reader', reason: 'Contact mail', status: 'pending', mailbox_address: null, created_at: '2026-10-02T00:00:00Z' }]]; }
    if (sql.startsWith('SELECT m.status, COUNT(*)')) return [[{ status: 'pending', count: 2 }]];
    if (sql.startsWith('UPDATE mailbox_access m JOIN users u')) { updatedLimit = params[0]; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('UPDATE mailbox_send_logs')) return [{ affectedRows: 1 }];
    throw Error('Unexpected query: ' + sql);
  });
  t.mock.method(db, 'getConnection', async () => ({
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    query: async (sql, params = []) => {
      if (sql.startsWith('SELECT status, mailbox_address')) return [[access]];
      if (sql.startsWith('UPDATE mailbox_access SET requested_local_part')) {
        access = { status: 'active', mailbox_address: params[0], smtp_secret: params[1], daily_limit: 50 };
        assert.equal(open(params[1], params[0]), 'ExistingPass9!');
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('SELECT user_id FROM mailbox_access')) return [[{ user_id: 2 }, { user_id: 3 }]];
      if (sql.startsWith("UPDATE mailbox_access SET status='rejected'")) { rejected = true; return [{ affectedRows: 2 }]; }
      if (sql.includes('SELECT m.mailbox_address, m.smtp_secret, m.daily_limit')) return [[{ ...access }]];
      if (sql.startsWith('INSERT INTO mailbox_send_logs')) return [{ affectedRows: 1 }];
      throw Error('Unexpected transaction query: ' + sql);
    },
  }));
  const app = express(); app.use(express.json());
  app.use('/mailboxes', require('../src/routes/mailboxes').router);
  app.use((error, _req, res, _next) => res.status(500).json({ message: error.message }));
  const server = await new Promise(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await db.end(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, id, body) => {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Cookie: `mooncci_token=${jwt.sign({ id }, process.env.JWT_SECRET)}` },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await request('/mailboxes/owner/connect', 2, { password: 'ExistingPass9!' })).status, 403);
  assert.equal((await request('/mailboxes/owner/connect', 1, { password: 'ExistingPass9!' })).status, 200);
  assert.equal(verified, 1);
  assert.equal(access.mailbox_address, 'mooncci@mooncci.site');
  assert.equal((await request('/mailboxes/send', 1, { to: 'recipient@example.com', subject: 'Hello', content: 'Body' })).status, 200);
  assert.equal(sent, true);
  assert.equal((await request('/mailboxes/admin/requests?status=pending&page=1', 2)).status, 403);
  const list = await request('/mailboxes/admin/requests?status=pending&page=1', 1);
  assert.equal(list.status, 200);
  assert.equal(list.body.total, 2);
  assert.equal(list.body.limit, 20);
  assert.equal((await request('/mailboxes/admin/requests?status=all&page=1', 1)).status, 200);
  assert.equal(pendingFirst, true);
  assert.equal((await request('/mailboxes/admin/requests/batch-reject', 1, { ids: [2, 3] })).status, 200);
  assert.equal(rejected, true);
  assert.equal((await request('/mailboxes/admin/requests/2/limit', 2, { dailyLimit: 0 })).status, 403);
  assert.equal((await request('/mailboxes/admin/requests/2/limit', 1, { dailyLimit: 0 })).status, 200);
  assert.equal(updatedLimit, 0);
});

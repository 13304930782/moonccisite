const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

test('mailbox approval waits for signed agent confirmation before outbound SMTP', async t => {
  process.env.JWT_SECRET = 'mailbox-test-jwt-only';
  process.env.MAILBOX_SECRET_KEY = crypto.randomBytes(32).toString('hex');
  process.env.MAILBOX_PROVISION_KEY = crypto.randomBytes(32).toString('hex');
  process.env.MAILBOX_SMTP_HOST = 'smtp.example.invalid';
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const db = require('../src/db');
  const nodemailer = require('nodemailer');
  const users = {
    1: { id: 1, username: 'owner', email: 'owner@example.invalid', role: 'owner', status: 'active' },
    2: { id: 2, username: 'reader', email: 'reader@example.invalid', role: 'user', status: 'active' },
  };
  const access = { user_id: 2, requested_local_part: 'reader', reason: 'Personal mail for project contacts', status: 'pending', mailbox_address: null, smtp_secret: null, daily_limit: 10, provision_request_id: null, provision_claimed_at: null };
  const logs = [];
  const deliveries = [];
  t.mock.method(nodemailer, 'createTransport', options => ({ sendMail: async mail => {
    assert.equal(options.auth.user, 'reader@mooncci.site');
    assert.equal(options.secure, true);
    deliveries.push(mail);
    return { messageId: 'fixture', accepted: [mail.to] };
  } }));
  async function query(sql, params = []) {
    if (sql.includes('FROM users') && sql.includes('auth_revocations')) return [[users[Number(params[0])]].filter(Boolean)];
    if (sql.includes('FROM mailbox_access WHERE user_id=? LIMIT 1')) return [[{ ...access }]];
    if (sql.includes('FROM mailbox_send_logs') && sql.includes('ORDER BY')) return [[...logs]];
    if (sql.startsWith('UPDATE mailbox_access SET status=\'active\'')) {
      assert.equal(params[0], access.provision_request_id);
      access.status = 'active';
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE mailbox_send_logs')) {
      logs.find(item => item.id === params[0]).status = 'accepted';
      return [{ affectedRows: 1 }];
    }
    throw Error('Unexpected query: ' + sql);
  }
  async function connectionQuery(sql, params = []) {
    if (sql.includes('SELECT m.requested_local_part')) return [[{ requested_local_part: access.requested_local_part }]];
    if (sql.includes("SET status='provisioning'")) {
      access.status = 'provisioning'; access.mailbox_address = params[0]; access.smtp_secret = params[1]; access.provision_request_id = params[2]; return [{ affectedRows: 1 }];
    }
    if (sql.includes('SELECT m.user_id, m.mailbox_address')) return [[access.status === 'provisioning' && !access.provision_claimed_at ? { ...access } : null].filter(Boolean)];
    if (sql.includes('SET provision_claimed_at=NOW()')) { access.provision_claimed_at = new Date(); return [{ affectedRows: 1 }]; }
    if (sql.includes('SELECT m.mailbox_address, m.smtp_secret')) return [[access.status === 'active' ? { ...access } : null].filter(Boolean)];
    if (sql.includes('COUNT(*) AS used')) return [[{ used: logs.length }]];
    if (sql.startsWith('INSERT INTO mailbox_send_logs')) { logs.push({ id: params[0], recipient_email: params[3], subject: params[4], status: 'sending' }); return [{ affectedRows: 1 }]; }
    throw Error('Unexpected transaction query: ' + sql);
  }
  t.mock.method(db, 'query', query);
  t.mock.method(db, 'getConnection', async () => ({
    beginTransaction: async () => {}, query: connectionQuery,
    commit: async () => {}, rollback: async () => {}, release: () => {},
  }));
  const app = express(); app.use(express.json());
  const routes = require('../src/routes/mailboxes');
  app.use('/mailboxes/agent', routes.agentRouter); app.use('/mailboxes', routes.router);
  app.use((error, _req, res, _next) => res.status(500).json({ message: error.message }));
  const server = await new Promise(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await db.end(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function post(path, body, userId) {
    const response = await fetch(base + path, { method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(userId ? { Cookie: `mooncci_token=${jwt.sign({ id: userId }, process.env.JWT_SECRET)}` } : {}) },
      body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }
  function agentHeaders(path, body) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = crypto.createHmac('sha256', Buffer.from(process.env.MAILBOX_PROVISION_KEY, 'hex'))
      .update(`${timestamp}\n${path}\n${JSON.stringify(body)}`).digest('hex');
    return { 'Content-Type': 'application/json', 'X-Mooncci-Timestamp': timestamp, 'X-Mooncci-Signature': signature };
  }
  async function agent(path, body, signed = true) {
    const response = await fetch(base + '/mailboxes/agent' + path, { method: 'POST',
      headers: signed ? agentHeaders(path, body) : { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }

  assert.equal((await post('/mailboxes/send', { to: 'a@example.com', subject: 'Hi', content: 'Hello' }, 2)).status, 403);
  assert.equal((await post('/mailboxes/admin/requests/2/approve', {}, 2)).status, 403);
  assert.equal((await post('/mailboxes/admin/requests/2/approve', {}, 1)).status, 202);
  assert.equal(access.status, 'provisioning');
  assert.equal((await post('/mailboxes/send', { to: 'a@example.com', subject: 'Hi', content: 'Hello' }, 2)).status, 403);
  assert.equal((await agent('/claim', {}, false)).status, 401);
  const claim = await agent('/claim', {});
  assert.equal(claim.status, 200);
  assert.equal(claim.body.job.address, 'reader@mooncci.site');
  assert.ok(claim.body.job.password.length >= 20);
  assert.equal((await agent('/claim', {})).body.job, null);
  assert.equal((await agent('/complete', { requestId: claim.body.job.requestId, address: claim.body.job.address, created: true }, false)).status, 401);
  assert.equal(access.status, 'provisioning');
  assert.equal((await agent('/complete', { requestId: claim.body.job.requestId, address: claim.body.job.address, created: true })).status, 200);
  const result = await post('/mailboxes/send', { to: 'outside@example.com', subject: 'Hello', content: 'Body' }, 2);
  assert.equal(result.status, 200);
  assert.equal(deliveries[0].from, 'reader@mooncci.site');
  assert.equal(deliveries[0].to, 'outside@example.com');
  assert.equal(logs[0].status, 'accepted');
  access.daily_limit = 1;
  assert.equal((await post('/mailboxes/send', { to: 'second@example.com', subject: 'Again', content: 'Body' }, 2)).status, 429);
  assert.equal(deliveries.length, 1);
});

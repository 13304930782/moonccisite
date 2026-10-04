const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

test('mailbox password reveal requires a one-use email code and rotation waits for signed mail-agent confirmation', async t => {
  process.env.JWT_SECRET = 'mailbox-credentials-test';
  process.env.MAILBOX_SECRET_KEY = crypto.randomBytes(32).toString('hex');
  process.env.MAILBOX_PROVISION_KEY = crypto.randomBytes(32).toString('hex');
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const db = require('../src/db');
  const mailer = require('../src/lib/mailer');
  const { seal, open } = require('../src/lib/mailboxSecurity');
  const user = { id: 2, username: 'reader', email: 'reader@example.com', role: 'user', status: 'active' };
  const address = 'reader@mooncci.site';
  const access = { user_id: 2, status: 'active', mailbox_address: address, smtp_secret: seal('InitialPassword9!', address), daily_limit: 10 };
  let challenge = null;
  let change = null;
  let emailCode = '';
  t.mock.method(mailer, 'sendMail', async message => {
    assert.equal(message.to, user.email);
    emailCode = message.text.match(/验证码：(\d{6})/)[1];
    return { sent: true };
  });
  const connection = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    query: async (sql, params = []) => {
      if (sql.includes('FROM account_challenges') && sql.includes('created_at>?')) return [[challenge && challenge.created_at > params[1] ? { id: challenge.id } : null].filter(Boolean)];
      if (sql.startsWith('DELETE FROM account_challenges')) { challenge = null; return [{ affectedRows: 1 }]; }
      if (sql.startsWith('INSERT INTO account_challenges')) {
        challenge = { id: params[0], user_id: params[1], session_hash: params[2], old_email: params[3], old_code_hash: params[4], created_at: params[5], expires_at: params[6], attempts: 0 };
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('FROM account_challenges') && sql.includes('session_hash=?')) return [[challenge && challenge.id === params[0] && challenge.session_hash === params[2] ? challenge : null].filter(Boolean)];
      if (sql.startsWith('UPDATE account_challenges SET attempts')) { challenge.attempts++; return [{ affectedRows: 1 }]; }
      if (sql.includes('FROM mailbox_access m LEFT JOIN mailbox_password_changes')) return [[{ ...access, change_status: change?.status || null }]];
      if (sql.includes('FROM mailbox_password_changes p JOIN mailbox_access')) return [[change?.status === 'pending' ? { user_id: 2, request_id: change.request_id, mailbox_address: address, new_secret: change.new_secret } : null].filter(Boolean)];
      if (sql.startsWith("UPDATE mailbox_password_changes SET status='claimed'")) { change.status = 'claimed'; return [{ affectedRows: 1 }]; }
      if (sql.includes('FROM mailbox_password_changes WHERE request_id=')) return [[change && change.request_id === params[0] ? { ...change, user_id: 2 } : null].filter(Boolean)];
      if (sql.startsWith('UPDATE mailbox_access SET smtp_secret=')) { access.smtp_secret = params[0]; return [{ affectedRows: 1 }]; }
      if (sql.startsWith("UPDATE mailbox_password_changes SET status='complete'")) { change.status = 'complete'; change.new_secret = null; return [{ affectedRows: 1 }]; }
      if (sql.startsWith('INSERT INTO mailbox_password_changes')) { change = { request_id: params[1], mailbox_address: params[2], new_secret: params[3], status: 'pending' }; return [{ affectedRows: 1 }]; }
      throw Error('Unexpected transaction query: ' + sql);
    },
  };
  t.mock.method(db, 'getConnection', async () => connection);
  t.mock.method(db, 'query', async (sql, params = []) => {
    if (sql.includes('FROM users') && sql.includes('auth_revocations')) return [[user]];
    if (sql.startsWith('SELECT user_id FROM mailbox_access')) return [[{ user_id: 2 }]];
    if (sql.startsWith('SELECT * FROM mailbox_access')) return [[{ ...access }]];
    if (sql.startsWith('SELECT status FROM mailbox_password_changes')) return [[change ? { status: change.status } : null].filter(Boolean)];
    if (sql.startsWith('UPDATE account_challenges SET expires_at=0')) return [{ affectedRows: 1 }];
    throw Error('Unexpected query: ' + sql);
  });
  const app = express(); app.use(express.json());
  const routes = require('../src/routes/mailboxes');
  app.use('/mailboxes/agent', routes.agentRouter); app.use('/mailboxes', routes.router);
  app.use((error, _req, res, _next) => res.status(500).json({ message: error.message }));
  const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await db.end(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const cookie = `mooncci_token=${jwt.sign({ id: 2 }, process.env.JWT_SECRET)}`;
  const post = async (path, body = {}, agent = false, signed = true) => {
    const payload = JSON.stringify(body);
    const headers = { 'Content-Type': 'application/json' };
    if (agent && signed) {
      const timestamp = String(Math.floor(Date.now() / 1000));
      headers['X-Mooncci-Timestamp'] = timestamp;
      headers['X-Mooncci-Signature'] = crypto.createHmac('sha256', Buffer.from(process.env.MAILBOX_PROVISION_KEY, 'hex')).update(`${timestamp}\n${path}\n${payload}`).digest('hex');
    } else if (!agent) headers.Cookie = cookie;
    const response = await fetch(base + '/mailboxes' + (agent ? '/agent' : '') + path,
      { method: 'POST', headers, body: payload });
    return { status: response.status, body: await response.json(), headers: response.headers };
  };
  const code = await post('/credentials/code');
  assert.equal(code.status, 200);
  assert.equal((await post('/credentials/reveal', { challenge_id: code.body.challenge_id, code: '000000' })).status, 400);
  const reveal = await post('/credentials/reveal', { challenge_id: code.body.challenge_id, code: emailCode });
  assert.equal(reveal.status, 200);
  assert.equal(reveal.body.password, 'InitialPassword9!');
  assert.match(reveal.headers.get('cache-control'), /no-store/);
  assert.equal((await post('/credentials/reveal', { challenge_id: code.body.challenge_id, code: emailCode })).status, 400);

  const next = await post('/credentials/code');
  assert.equal(next.status, 200);
  assert.equal((await post('/credentials/change', { challenge_id: next.body.challenge_id, code: emailCode, password: 'weak' })).status, 400);
  const changed = await post('/credentials/change', { challenge_id: next.body.challenge_id, code: emailCode, password: 'NewMailboxPassword42!' });
  assert.equal(changed.status, 202);
  assert.equal(open(access.smtp_secret, address), 'InitialPassword9!');
  assert.equal((await post('/credentials/reveal', { challenge_id: next.body.challenge_id, code: emailCode })).status, 409);
  assert.equal((await post('/rotation-claim', {}, true, false)).status, 401);
  const claim = await post('/rotation-claim', {}, true);
  assert.equal(claim.status, 200);
  assert.equal(claim.body.job.password, 'NewMailboxPassword42!');
  assert.equal((await post('/rotation-complete', { requestId: claim.body.job.requestId, address, changed: true }, true)).status, 200);
  assert.equal(open(access.smtp_secret, address), 'NewMailboxPassword42!');
  assert.equal(change.status, 'complete');
  assert.equal(change.new_secret, null);
});

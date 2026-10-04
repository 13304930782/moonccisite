const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');

test('send retains synchronous APPEND, accepted/uncertain semantics and sanitized timing', async t => {
  process.env.JWT_SECRET = 'mailbox-timing-test';
  process.env.MAILBOX_SECRET_KEY = crypto.randomBytes(32).toString('hex');
  process.env.MAILBOX_SMTP_HOST = 'example.invalid';
  process.env.MAILBOX_TIMING_ENABLED = 'true';
  process.env.MAILBOX_TIMING_SAMPLE_RATE = '1';
  const express = require('express'), jwt = require('jsonwebtoken');
  const db = require('../src/db'), imap = require('../src/lib/mailboxImap');
  const { seal } = require('../src/lib/mailboxSecurity');
  const rows = [], timings = [], invalidations = [];
  let deliveries = 0, smtpFails = false, releaseCopy, copyStarted;
  const copyReached = new Promise(r => { copyStarted = r; });
  const copyGate = new Promise(r => { releaseCopy = r; });
  const account = { mailbox_address: 'mooncci@mooncci.site', smtp_secret: seal('SecretPassword42!', 'mooncci@mooncci.site'), daily_limit: 0 };
  const query = async (sql, args = []) => {
    if (sql.includes('FROM users') && sql.includes('auth_revocations')) return [[{ id: 1, role: 'owner', status: 'active' }]];
    if (sql.includes('SELECT m.mailbox_address')) return [[account]];
    if (sql.startsWith('INSERT INTO mailbox_send_logs')) { rows.push({ id: args[0], status: 'sending' }); return [{}]; }
    if (sql.startsWith('UPDATE mailbox_send_logs')) { rows.find(r => r.id === args[0]).status = sql.includes("status='accepted'") ? 'accepted' : 'uncertain'; return [{}]; }
    if (sql.startsWith('UPDATE mailbox_access SET status=')) return [{ affectedRows: 1 }];
    throw Error('Unexpected query');
  };
  t.mock.method(db, 'query', query);
  t.mock.method(db, 'getConnection', async () => ({ query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} }));
  t.mock.method(console, 'info', line => timings.push(JSON.parse(line)));
  t.mock.method(console, 'error', () => {});
  t.mock.method(require('nodemailer'), 'createTransport', () => ({ sendMail: async () => {
    deliveries++; if (smtpFails) throw Object.assign(Error('sensitive transport detail'), { code: 'ETIMEDOUT' });
    return { accepted: ['target@example.invalid'] };
  } }));
  t.mock.method(imap, 'appendSent', async (_account, _raw, timing) => {
    copyStarted(); await timing.measure('imap_append_ms', () => copyGate);
    throw Error('Sent unavailable');
  });
  t.mock.method(imap, 'invalidate', id => invalidations.push(String(id)));
  const app = express(); app.use(express.json()); app.use('/mailboxes', require('../src/routes/mailboxes').router);
  app.use((error, _req, res, _next) => res.status(500).json({ message: 'failed' }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await db.end(); });
  const post = (route, body = {}) => fetch(`http://127.0.0.1:${server.address().port}/mailboxes${route}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `mooncci_token=${jwt.sign({ id: 1 }, process.env.JWT_SECRET)}` }, body: JSON.stringify(body),
  });
  const payload = { to: 'target@example.invalid', subject: 'Sensitive subject', content: 'Sensitive body' };
  let settled = false;
  const pending = post('/send', payload).then(r => { settled = true; return r; });
  await copyReached; await delay(10); assert.equal(settled, false); assert.equal(rows[0].status, 'accepted');
  releaseCopy(); const response = await pending, body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.savedToSent, false); assert.equal(deliveries, 1); assert.equal(rows[0].status, 'accepted');
  const timing = timings[0]; assert.equal(timing.request_id, response.headers.get('x-mail-request-id'));
  for (const key of ['db_pool_wait_ms', 'db_prepare_ms', 'mime_build_ms', 'smtp_submit_ms', 'db_accept_ms', 'imap_connect_ms', 'imap_sent_lookup_ms', 'imap_append_ms', 'total_ms']) assert.equal(typeof timing[key], 'number');
  assert.ok(!/SecretPassword|Sensitive|smtp_secret|target@example/.test(JSON.stringify(timings)));
  smtpFails = true; assert.equal((await post('/send', payload)).status, 502);
  assert.equal(rows[1].status, 'uncertain'); assert.equal(deliveries, 2);
  assert.equal((await post('/owner/disconnect')).status, 200);
  assert.equal((await post('/admin/requests/2/revoke')).status, 200);
  assert.deepEqual(invalidations, ['1', '2']);
});

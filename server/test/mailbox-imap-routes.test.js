const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

test('IMAP folders are isolated to the signed-in account and reject arbitrary folders and stale identifiers', async t => {
  process.env.JWT_SECRET = 'imap-routes-test-secret';
  process.env.MAILBOX_SECRET_KEY = crypto.randomBytes(32).toString('hex');
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const db = require('../src/db');
  const imap = require('../src/lib/mailboxImap');
  const users = {
    1: { id: 1, role: 'owner', status: 'active' },
    2: { id: 2, role: 'user', status: 'active' },
  };
  const accounts = { 1: { mailbox_address: 'mooncci@mooncci.site', smtp_secret: 'encrypted' } };
  const observed = [];
  t.mock.method(db, 'query', async (sql, params) => {
    if (sql.includes('FROM users') && sql.includes('auth_revocations')) return [[users[Number(params[0])]].filter(Boolean)];
    if (sql.includes('FROM mailbox_access m') && sql.includes("m.status='active'")) return [[accounts[Number(params[0])]].filter(Boolean)];
    throw Error('Unexpected query');
  });
  t.mock.method(imap, 'listMessages', async (account, folder, page) => {
    observed.push([account.mailbox_address, folder, page]);
    return { messages: [{ uid: 4, subject: 'Test' }], total: 1, page, pageSize: 25, uidValidity: '123', folderAvailable: true };
  });
  t.mock.method(imap, 'readMessage', async (account, folder, uid, validity) => {
    observed.push([account.mailbox_address, folder, uid, validity]);
    return validity === '123' ? { uid, subject: 'Test', text: 'Private' } : null;
  });
  const app = express(); app.use('/mailboxes', require('../src/routes/mailboxes').router);
  app.use((error, _req, res, _next) => res.status(500).json({ message: error.message }));
  const server = await new Promise(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await db.end(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (path, id) => {
    const response = await fetch(base + path, { headers: { Cookie: `mooncci_token=${jwt.sign({ id }, process.env.JWT_SECRET)}` } });
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
  };
  assert.equal((await get('/mailboxes/folders/inbox', 2)).status, 403);
  assert.equal((await get('/mailboxes/folders/trash', 1)).status, 404);
  assert.equal((await get('/mailboxes/folders/inbox?page=0', 1)).status, 400);
  const inbox = await get('/mailboxes/folders/inbox', 1);
  assert.equal(inbox.status, 200);
  assert.equal(inbox.cache, 'private, no-store');
  assert.equal(inbox.body.messages[0].subject, 'Test');
  assert.equal((await get('/mailboxes/folders/inbox/4?uidValidity=wrong', 1)).status, 400);
  assert.equal((await get('/mailboxes/folders/inbox/4?uidValidity=999', 1)).status, 404);
  const message = await get('/mailboxes/folders/inbox/4?uidValidity=123', 1);
  assert.equal(message.status, 200);
  assert.equal(message.body.message.text, 'Private');
  assert.deepEqual(observed, [
    ['mooncci@mooncci.site', 'inbox', 1],
    ['mooncci@mooncci.site', 'inbox', 4, '999'],
    ['mooncci@mooncci.site', 'inbox', 4, '123'],
  ]);
});

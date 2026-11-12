const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createDailyRouters } = require('../src/routes/dailyQuestions');

test('daily question read and answer limits are separate from answer deduplication', async t => {
  const db = { query: async () => [[]] };
  const { router } = createDailyRouters({ db, now: () => Date.parse('2026-11-12T16:30:00Z') });
  const app = express(); app.use(express.json()); app.use('/daily', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/daily`;
  assert.equal((await fetch(`${base}/summary`)).status, 200);
  assert.equal((await fetch(`${base}/preview`)).status, 404);
  for (let i = 0; i < 118; i++) assert.equal((await fetch(base)).status, 200);
  assert.equal((await fetch(base)).status, 429);
  for (let i = 0; i < 20; i++) assert.equal((await fetch(`${base}/answers`, { method: 'POST' })).status, 403);
  assert.equal((await fetch(`${base}/answers`, { method: 'POST' })).status, 429);
});

test('admin endpoints share their own limit without consuming public budgets', async t => {
  const auth = require('../src/middleware/auth');
  t.mock.method(auth, 'authRequired', (req, res, next) => { if (!req.get('x-role')) return res.sendStatus(401); req.user = { role: req.get('x-role') }; next(); });
  t.mock.method(auth, 'adminOnly', (req, res, next) => req.user.role === 'owner' ? next() : res.sendStatus(403));
  delete require.cache[require.resolve('../src/routes/dailyQuestions')];
  const { createDailyRouters: create } = require('../src/routes/dailyQuestions');
  const endpoints = create({ db: { query: async () => [[]] }, now: () => Date.parse('2026-11-12T16:30:00Z') });
  const app = express(); app.use(express.json()); app.use('/daily', endpoints.router); app.use('/admin', endpoints.admin);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method = 'GET', role = 'owner') => fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(role ? { 'x-role': role } : {}) }, ...(method === 'GET' ? {} : { body: '{}' }) });
  assert.equal((await request('/admin', 'GET', '')).status, 401);
  assert.equal((await request('/admin', 'GET', 'user')).status, 403);
  assert.equal((await request('/admin')).status, 200);
  for (const [method, path] of [['PUT','/admin/bad'],['DELETE','/admin/bad'],['POST','/admin/bad/publish'],['POST','/admin/bad/generate'],['POST','/admin/bad/review']]) assert.equal((await request(path, method)).status, 400);
  for (let i = 0; i < 114; i++) assert.equal((await request('/admin')).status, 200);
  assert.equal((await request('/admin')).status, 429);
  assert.equal((await request('/admin/bad/publish', 'POST')).status, 429);
  assert.equal((await request('/daily')).status, 200);
  assert.equal((await request('/daily/answers', 'POST')).status, 403);
});

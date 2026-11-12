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

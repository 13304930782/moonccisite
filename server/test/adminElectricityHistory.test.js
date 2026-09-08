const test = require('node:test');
const assert = require('node:assert/strict');

test('only an active owner can manually sync fixed-scope history; cooldown, busy and failures are explicit', async (t) => {
  process.env.JWT_SECRET = 'local-electricity-admin-test-only';
  const db = require('../src/db');
  t.mock.method(
    require('../src/middleware/electricityRoom'),
    'roomAccess',
    () => (_req, _res, next) => next(),
  );
  const jwt = require('jsonwebtoken');
  const express = require('express');
  t.mock.method(db, 'query', async (_sql, params) => [
    [
      {
        id: params[0],
        role:
          params[0] === 1 || params[0] === 4
            ? 'owner'
            : params[0] === 2
              ? 'admin'
              : 'user',
        status: params[0] === 4 ? 'disabled' : 'active',
      },
    ],
  ]);
  const repo = require('../src/repositories/electricityRepository');
  let paused = false;
  t.mock.method(repo, 'getMonitorState', async () =>
    paused ? { lastErrorAt: new Date().toISOString() } : {},
  );
  const service = require('../src/services/electricityHistorySync');
  let calls = 0,
    result = { status: 'synced', count: 7 },
    failure;
  t.mock.method(service, 'syncElectricityHistory', async (...args) => {
    assert.equal(
      args.length,
      0,
      'client cannot supply room, time, cooldown override or data',
    );
    calls++;
    if (failure) throw failure;
    return result;
  });
  const monitor = require('../src/services/electricityMonitor');
  for (const name of [
    'refreshElectricity',
    'sendTestElectricityEmail',
    'runElectricityCycle',
  ])
    t.mock.method(monitor, name, async () => {
      assert.fail(
        'manual history must not trigger reports, collection cycle or mail',
      );
    });
  const app = express();
  app.use(express.json());
  app.use('/api/admin/electricity', require('../src/routes/adminElectricity'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.end();
  });
  const request = (id, method = 'POST') =>
    fetch(
      `http://127.0.0.1:${server.address().port}/api/admin/electricity/sync-history`,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(id
            ? {
                Cookie: `mooncci_token=${jwt.sign({ id }, process.env.JWT_SECRET)}`,
              }
            : {}),
        },
        ...(method === 'POST'
          ? {
              body: JSON.stringify({
                scope: 'another-room',
                now: '2030-01-01',
                force: true,
              }),
            }
          : {}),
      },
    );
  assert.equal((await request()).status, 401);
  for (const id of [2, 3, 4]) assert.equal((await request(id)).status, 403);
  assert.equal((await request(1, 'GET')).status, 404);
  assert.equal(calls, 0);
  let response = await request(1);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).data.count, 7);
  result = { status: 'cooldown', count: 0, retryAfterSeconds: 780 };
  response = await request(1);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '780');
  assert.match((await response.json()).message, /13 分钟/);
  result = { status: 'busy', count: 0 };
  assert.equal((await request(1)).status, 409);
  result = { status: 'empty', count: 0 };
  assert.match((await (await request(1)).json()).message, /未返回有效/);
  failure = new Error('private raw upstream response');
  response = await request(1);
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /private raw/);
  const beforePaused = calls;
  paused = true;
  assert.equal((await request(1)).status, 429);
  assert.equal(calls, beforePaused);
});

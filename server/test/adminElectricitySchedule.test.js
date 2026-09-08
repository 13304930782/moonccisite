const test = require('node:test');
const assert = require('node:assert/strict');

test('schedule settings persist through the owner API, validate before writing, and do not send mail', async (t) => {
  process.env.JWT_SECRET = 'local-schedule-test-only';
  process.env.MOONCCI_TASK_PROCESS = 'false';
  const db = require('../src/db');
  t.mock.method(
    require('../src/middleware/electricityRoom'),
    'roomAccess',
    () => (_req, _res, next) => next(),
  );
  let stored = JSON.stringify({
    enabled: true,
    dailyNotify: true,
    notifyTo: 'owner@example.test',
    lowPurchaseThreshold: 10,
    lowTotalThreshold: 20,
  });
  let writes = 0;
  t.mock.method(db, 'query', async (sql, params) => {
    if (/FROM users/.test(sql))
      return [
        [
          {
            id: params[0],
            role: params[0] === 1 ? 'owner' : 'user',
            status: 'active',
          },
        ],
      ];
    if (/SELECT setting_value/.test(sql)) return [[{ setting_value: stored }]];
    if (/INSERT INTO site_settings/.test(sql)) {
      assert.equal(params[0], 'electricity');
      stored = params[1];
      writes++;
      return [{}];
    }
    assert.fail(sql);
  });
  const repo = require('../src/repositories/electricityRepository');
  t.mock.method(repo, 'getMonitorState', async () => ({}));
  const monitor = require('../src/services/electricityMonitor');
  t.mock.method(monitor, 'getDashboardData', async () => ({
    current: null,
    status: 'unknown',
  }));
  for (const name of [
    'refreshElectricity',
    'sendTestElectricityEmail',
    'runElectricityCycle',
  ])
    t.mock.method(monitor, name, async () =>
      assert.fail('settings must not send mail or collect'),
    );
  const express = require('express'),
    jwt = require('jsonwebtoken');
  const app = express();
  app.use(express.json());
  app.use('/api/admin/electricity', require('../src/routes/adminElectricity'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.end();
  });
  const request = (method, body, id = 1) =>
    fetch(
      `http://127.0.0.1:${server.address().port}/api/admin/electricity/settings`,
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
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
  assert.equal((await request('PUT', {}, 0)).status, 401);
  assert.equal((await request('PUT', {}, 2)).status, 403);
  const legacy = (await (await request('GET')).json()).data.config;
  assert.deepEqual(
    legacy.schedule.map((row) => row.hour),
    [0, 7, 12, 21],
  );
  assert.equal(writes, 0, 'reading legacy settings does not mutate them');
  const custom = [
    { hour: 0, type: 'daily' },
    { hour: 8, type: 'morning' },
    { hour: 13, type: 'collect' },
    { hour: 20, type: 'evening' },
    { hour: 22, type: 'collect' },
  ];
  assert.equal((await request('PUT', { schedule: custom })).status, 200);
  let config = (await (await request('GET')).json()).data.config;
  assert.deepEqual(config.schedule, custom);
  assert.equal(config.notifyTo, 'owner@example.test');
  const beforeInvalid = stored;
  assert.equal(
    (
      await request('PUT', {
        schedule: [...custom, { hour: 8, type: 'collect' }],
      })
    ).status,
    400,
  );
  assert.equal(stored, beforeInvalid);
  assert.equal(
    (await request('PUT', { schedule: custom.slice(1) })).status,
    400,
  );
  assert.equal(writes, 1);
  assert.equal((await request('PUT', { dailyNotify: false })).status, 200);
  config = (await (await request('GET')).json()).data.config;
  assert.deepEqual(
    config.schedule,
    custom,
    'legacy clients preserve saved plan',
  );
  assert.equal(config.dailyNotify, false);
});

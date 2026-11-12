const test = require('node:test');
const assert = require('node:assert/strict');
test('weather administration requires active owner/admin login and persists set/reset across routes', async (t) => {
  process.env.JWT_SECRET = 'weather-qa-secret-not-for-production-0123456789';
  const db = require('../src/db');
  const jwt = require('jsonwebtoken');
  const express = require('express');
  const stored = new Map();
  t.mock.method(db, 'query', async (sql, params) => {
    if (sql.includes('FROM users'))
      return [
        [
          {
            id: params[0],
            role:
              params[0] === 1 ? 'owner' : params[0] === 2 ? 'user' : 'admin',
            status: params[0] === 4 ? 'disabled' : 'active',
          },
        ],
      ];
    if (sql.startsWith('SELECT setting_value'))
      return [[{ setting_value: JSON.stringify(stored.get(params[0]) ?? null) }]];
    if (sql.startsWith('INSERT INTO site_settings')) {
      stored.set(params[0], JSON.parse(params[1]));
      return [{}];
    }
    throw new Error('Unexpected query');
  });
  const repo = require('../src/repositories/weatherMoodRepository');
  const { normalizeForecast, businessDate } = require('../src/lib/weatherMood');
  t.mock.method(repo, 'withLock', async (_key, callback) => {
    const now = new Date();
    return callback(
      {
        snapshot: normalizeForecast(
          {
            timezone: 'Asia/Shanghai',
            utc_offset_seconds: 28800,
            daily: { time: [businessDate(now)], weather_code: [3] },
          },
          now,
        ),
      },
      async () => {},
    );
  });
  const routes = require('../src/routes/weatherMood');
  const { AUTH_COOKIE_NAME } = require('../src/middleware/auth');
  const app = express();
  app.use(express.json());
  app.use('/public', routes.router);
  app.use('/admin', routes.admin);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await db.end();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method = 'GET', id, body) =>
    fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(id
          ? {
              Cookie: `${AUTH_COOKIE_NAME}=${jwt.sign({ id }, process.env.JWT_SECRET)}`,
            }
          : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal((await request('/admin')).status, 401);
  assert.equal(
    (await request('/admin', 'PUT', 2, { emotionId: '10' })).status,
    403,
  );
  assert.equal(
    (await request('/admin', 'PUT', 4, { emotionId: '10' })).status,
    403,
  );
  assert.equal(
    (await request('/admin', 'PUT', 1, { emotionId: 'bad' })).status,
    400,
  );
  const save = await request('/admin', 'PUT', 1, { emotionId: '16' });
  assert.equal(save.status, 200);
  assert.equal((await save.json()).data.override.durationDays, 1);
  const publicResponse = await request('/public');
  assert.equal(publicResponse.headers.get('cache-control'), 'no-store');
  assert.equal((await publicResponse.json()).data.mood.emotionId, '16');
  assert.equal((await request('/public', 'POST', undefined, { location: { latitude: 1000, longitude: 0 } })).status, 400);
  assert.equal((await request('/public/cities', 'POST', undefined, { query: 'a' })).status, 400);
  assert.equal((await request('/public/locate', 'POST', undefined, { location: null })).status, 400);
  const selected = await request('/public', 'POST', undefined, { location: { name: '测试城', latitude: 40.6, longitude: 120.7 } });
  assert.equal(selected.status, 200);
  assert.equal((await selected.json()).data.city.name, '测试城');
  assert.equal(
    (await (await request('/admin', 'GET', 3)).json()).data.override.emotionId,
    '16',
  );
  assert.equal((await request('/admin', 'DELETE', 2)).status, 403);
  assert.equal((await request('/admin', 'DELETE', 1)).status, 200);
  assert.equal((await (await request('/public')).json()).data.mode, 'weather');
  assert.equal(stored.get('weather_companion_override:v1'), null);

  const publicData = async () => (await (await request('/public', 'POST', undefined, {})).json()).data;
  const empty = await publicData();
  assert.equal('statusLine' in empty, false);
  assert.equal('statusEndsAt' in empty, false);
  const endsAt = new Date(Date.now() + 60_000).toISOString();
  assert.equal((await request('/admin/status', 'PUT', undefined, { text: '写代码', endsAt })).status, 401);
  assert.equal((await request('/admin/status', 'PUT', 2, { text: '写代码', endsAt })).status, 403);
  assert.equal((await request('/admin/status', 'PUT', 1, { text: 'x'.repeat(41), endsAt })).status, 400);
  assert.equal((await request('/admin/status', 'PUT', 1, { text: '写代码', endsAt: 'bad' })).status, 400);
  const statusSave = await request('/admin/status', 'PUT', 3, { text: '  在写代码  ', endsAt });
  assert.equal(statusSave.status, 200);
  assert.deepEqual((await statusSave.json()).data.status, { text: '在写代码', endsAt });
  assert.equal((await (await request('/admin', 'GET', 1)).json()).data.status.text, '在写代码');
  const active = await publicData();
  assert.equal(active.statusLine, '在写代码');
  assert.equal(active.statusEndsAt, endsAt);
  const past = new Date(Date.now() - 60_000).toISOString();
  assert.equal((await request('/admin/status', 'PUT', 1, { text: '过期', endsAt: past })).status, 200);
  assert.equal('statusLine' in await publicData(), false);
  assert.equal((await (await request('/admin', 'GET', 1)).json()).data.status, null);
  assert.equal((await request('/admin/status', 'DELETE', 2)).status, 403);
  assert.equal((await request('/admin/status', 'DELETE', 1)).status, 200);
  assert.equal('statusLine' in await publicData(), false);
  assert.equal((await request('/admin/status', 'PUT', 1, { text: '   ' })).status, 200);
});

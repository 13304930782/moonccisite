const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test(
  'multi-room migration, encrypted import, data/recipient isolation and real HTTP permissions',
  { skip: process.env.ELECTRICITY_ROOMS_INTEGRATION !== 'true' },
  async (t) => {
    assert.equal(process.env.DB_HOST, '127.0.0.1');
    assert.equal(process.env.DB_NAME, 'mooncci_electricity_rooms_qa');
    process.env.JWT_SECRET = 'local-multi-room-jwt';
    process.env.ELECTRICITY_CREDENTIAL_KEY = 'ab'.repeat(32);
    process.env.ELECTRICITY_SCHOOL_ACCOUNT = 'legacy-account';
    process.env.ELECTRICITY_ROOM_VERIFY = 'legacy-secret';
    process.env.SITE_URL = 'https://mooncci.example.test';
    process.env.MOONCCI_TASK_PROCESS = 'false';
    const mysql = require('mysql2/promise');
    const bootstrap = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: 'root',
      password: '',
    });
    await bootstrap.query(
      'CREATE DATABASE IF NOT EXISTS mooncci_electricity_rooms_qa',
    );
    await bootstrap.end();
    const db = require('../src/db');
    t.after(() => db.end());
    await db.query(
      'CREATE TABLE IF NOT EXISTS users(id INT PRIMARY KEY,username VARCHAR(100) UNIQUE,email VARCHAR(100),role VARCHAR(20),status VARCHAR(20),can_comment INT) ENGINE=InnoDB',
    );
    await db.query(
      'CREATE TABLE IF NOT EXISTS site_settings(setting_key VARCHAR(100) PRIMARY KEY,setting_value TEXT)',
    );
    for (const name of [
      '202609010001_create_electricity_monitor.sql',
      '202609020001_add_electricity_email_slot.sql',
      '202609050002_create_electricity_reports.sql',
      '202609070001_create_electricity_daily_usage.sql',
      '202609090001_electricity_rooms.sql',
    ]) {
      const text = fs
        .readFileSync(
          path.join(__dirname, '../database/migrations', name),
          'utf8',
        )
        .replace(/^\uFEFF/, '');
      for (const sql of text
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean))
        try {
          await db.query(sql);
        } catch (e) {
          if (
            ![
              'ER_DUP_FIELDNAME',
              'ER_CANT_DROP_FIELD_OR_KEY',
              'ER_DUP_KEYNAME',
            ].includes(e.code)
          )
            throw e;
        }
    }
    for (const table of [
      'electricity_room_members',
      'electricity_rss_subscriptions',
      'electricity_rooms',
      'electricity_room_state',
      'electricity_room_runs',
      'electricity_daily_usage',
      'electricity_midnight_snapshots',
      'electricity_reports',
      'electricity_snapshots',
      'electricity_monitor_state',
      'site_settings',
      'users',
    ])
      await db.query(`DELETE FROM ${table}`);
    await db.query(
      "INSERT INTO users VALUES(1,'mooncci','owner@example.test','owner','active',1),(2,'friend-a','a@example.test','user','active',1),(3,'friend-b','b@example.test','user','active',1),(4,'outsider','out@example.test','user','active',1),(5,'disabled','d@example.test','user','disabled',1),(6,'admin','admin@example.test','admin','active',1)",
    );
    const schedule = [
      { hour: 0, type: 'daily' },
      { hour: 7, type: 'morning' },
      { hour: 12, type: 'collect' },
      { hour: 21, type: 'evening' },
    ];
    await db.query("INSERT INTO site_settings VALUES('electricity',?)", [
      JSON.stringify({
        schedule,
        enabled: true,
        dailyNotify: true,
        notifyTo: '',
        lowPurchaseThreshold: 10,
        lowTotalThreshold: 20,
      }),
    ]);
    await db.query(
      "INSERT INTO electricity_snapshots(snapshot_date,recorded_at,room_name,meter_id,total_remaining) VALUES('2026-09-08','2026-09-08 21:00:00','原有宿舍','meter-legacy-account',90)",
    );
    await db.query(
      "INSERT INTO electricity_monitor_state(id,last_daily_email_date,last_daily_email_slot) VALUES(1,'2026-09-08','evening')",
    );
    const rooms = require('../src/repositories/electricityRoomRepository');
    const { currentScope } = require('../src/lib/electricityRssToken');
    const {
      electricityEnv,
      roomContext,
    } = require('../src/lib/electricityContext');
    const reports = require('../src/repositories/electricityReportRepository');
    const scope = currentScope();
    const oldToken = (await reports.createSubscription(1, scope)).token;
    const legacyId = await rooms.migrateLegacy();
    assert.equal(await rooms.migrateLegacy(), legacyId);
    const legacy = await rooms.getRoom(legacyId);
    assert.equal(legacy.scope_key, scope);
    assert.equal(
      (await db.query('SELECT scope_key FROM electricity_snapshots'))[0][0]
        .scope_key,
      scope,
    );
    assert.ok(await reports.authorizedScope(oldToken, scope));
    assert.ok(!legacy.credentials_encrypted.includes('legacy-secret'));
    assert.equal((await rooms.listRooms({ id: 2, role: 'user' })).length, 0);
    const { encrypt, decrypt } = require('../src/lib/electricityCredentials');
    assert.throws(() => decrypt(encrypt({ account: 'x' }, 'one'), 'two'));
    let collections = 0;
    const collected = [];
    const upstream = require('../src/lib/electricity');
    t.mock.method(upstream, 'fetchElectricitySnapshot', async () => {
      const account = electricityEnv().ELECTRICITY_SCHOOL_ACCOUNT;
      await new Promise((r) => setTimeout(r, 2));
      assert.equal(
        electricityEnv().ELECTRICITY_SCHOOL_ACCOUNT,
        account,
        'async contexts remain isolated',
      );
      collections++;
      collected.push(account);
      if (account === 'bad')
        throw Object.assign(new Error('private upstream error'), {
          code: 'ELECTRICITY_NETWORK_ERROR',
        });
      return {
        meterId: `meter-${account}`,
        roomName: `school-${account}`,
        deviceName: 'meter',
        status: 'online',
        totalRemaining: account === 'a' ? 50 : 70,
        purchasedRemaining: 30,
        subsidyRemaining: 20,
        todayUse: account === 'a' ? 4 : 8,
        price: 0.5,
      };
    });
    t.mock.method(upstream, 'fetchElectricityDailyUsage', async () => [
      {
        usageDate: '2026-09-07',
        usage: electricityEnv().ELECTRICITY_SCHOOL_ACCOUNT === 'a' ? 4 : 8,
        status: 'valid',
        method: 'school_daily',
      },
    ]);
    const mailer = require('../src/lib/mailer');
    const sent = [];
    t.mock.method(mailer, 'getMailConfig', async () => ({
      notify_to: 'global@example.test',
      site_url: 'https://mooncci.example.test',
    }));
    t.mock.method(mailer, 'sendMail', async (mail) => {
      sent.push(mail);
      if (mail.to === 'fail@example.test') throw new Error('SMTP failure');
      return { sent: true };
    });
    const monitor = require('../src/services/electricityMonitor');
    const input = [
      {
        name: '朋友 A',
        account: 'a',
        roomVerify: 'private-a',
        notifyTo: 'a@example.test',
        members: ['friend-a'],
      },
      {
        name: '朋友 B',
        account: 'b',
        roomVerify: 'private-b',
        notifyTo: 'b@example.test',
        members: ['friend-b'],
      },
    ];
    const preview = await rooms.importRooms(input, true);
    assert.equal(preview.length, 2);
    assert.doesNotMatch(JSON.stringify(preview), /private-a|private-b/);
    assert.equal((await rooms.listRooms({ id: 1, role: 'owner' })).length, 1);
    await assert.rejects(
      rooms.importRooms([input[0], { ...input[1], account: 'bad' }]),
    );
    assert.equal(
      (await rooms.listRooms({ id: 1, role: 'owner' })).length,
      1,
      'failed import writes no partial batch',
    );
    const imported = await rooms.importRooms(input);
    let a = await rooms.getRoom(imported[0].id),
      b = await rooms.getRoom(imported[1].id);
    await assert.rejects(rooms.importRooms([input[0]]));
    assert.equal((await rooms.listRooms({ id: 2, role: 'user' }))[0].id, a.id);
    const now = new Date('2026-09-08T07:00:00+08:00');
    await Promise.all(
      [a, b].map((room) =>
        rooms.inRoom(
          room,
          () => monitor.runElectricityCycle({ dailySlot: 'morning', now }),
          { credentials: true },
        ),
      ),
    );
    const repo = require('../src/repositories/electricityRepository');
    const [dataA, dataB] = await Promise.all(
      [a, b].map((room) =>
        rooms.inRoom(room, () => monitor.getDashboardData()),
      ),
    );
    assert.equal(dataA.current.totalRemaining, 50);
    assert.equal(dataB.current.totalRemaining, 70);
    assert.equal(dataA.history.length, 1);
    assert.equal(dataB.history.length, 1);
    assert.deepEqual(sent.map((m) => m.to).sort(), [
      'a@example.test',
      'b@example.test',
    ]);
    assert.ok(sent.some((m) => m.html.includes(a.id)));
    assert.ok(sent.some((m) => m.html.includes(b.id)));
    const beforeRetry = collections;
    await rooms.inRoom(
      a,
      () => monitor.runElectricityCycle({ dailySlot: 'morning', now }),
      { credentials: true },
    );
    assert.equal(collections, beforeRetry);
    assert.equal(sent.length, 2);
    await rooms.inRoom(a, () =>
      repo.markCollectionFailure(now, 'fixture-failure'),
    );
    assert.equal(
      (await rooms.inRoom(b, () => repo.getMonitorState())).lastErrorCode,
      null,
    );
    const history = require('../src/services/electricityHistorySync');
    const historyNow = new Date('2026-09-08T12:00:00+08:00');
    await Promise.all(
      [a, b].map((room) =>
        rooms.inRoom(
          room,
          () => history.syncElectricityHistory({ now: historyNow }),
          { credentials: true },
        ),
      ),
    );
    const daily = require('../src/repositories/electricityDailyUsageRepository');
    assert.equal(
      (await rooms.inRoom(a, () => daily.getDailyHistory(7, historyNow)))[0]
        .usage,
      4,
    );
    assert.equal(
      (await rooms.inRoom(b, () => daily.getDailyHistory(7, historyNow)))[0]
        .usage,
      8,
    );
    // One room's manual history cooldown never blocks another room.
    assert.equal(
      (
        await rooms.inRoom(
          a,
          () => history.syncElectricityHistory({ now: historyNow }),
          { credentials: true },
        )
      ).status,
      'cooldown',
    );
    await rooms.inRoom(a, () =>
      repo.saveElectricityConfig({ notifyTo: 'fail@example.test' }),
    );
    await assert.rejects(
      rooms.inRoom(
        a,
        () =>
          monitor.runElectricityCycle({
            dailySlot: 'evening',
            now: new Date('2026-09-08T21:00:00+08:00'),
          }),
        { credentials: true },
      ),
      /SMTP failure/,
    );
    assert.equal(
      (await reports.listReports(a.scope_key)).length,
      2,
      'failed email leaves a readable report',
    );
    await rooms.inRoom(b, () => repo.saveElectricityConfig({ notifyTo: '' }));
    const beforeEmpty = sent.length;
    await rooms.inRoom(b, () => monitor.sendTestElectricityEmail(), {
      credentials: true,
    });
    assert.equal(
      sent.length,
      beforeEmpty,
      'blank new-room recipient never uses global address',
    );
    const express = require('express'),
      jwt = require('jsonwebtoken');
    const app = express();
    app.use(express.json());
    app.use('/api/electricity/rss', require('../src/routes/electricityRss'));
    app.use('/api/electricity', require('../src/routes/electricity'));
    app.use(
      '/api/admin/electricity/rooms',
      require('../src/routes/adminElectricityRooms'),
    );
    app.use(
      '/api/admin/electricity',
      require('../src/routes/adminElectricity'),
    );
    const server = app.listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    t.after(() => new Promise((r) => server.close(r)));
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = (url, id, method = 'GET', body) =>
      fetch(base + url, {
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
      });
    for (const route of [
      '/api/electricity',
      '/api/electricity/current',
      '/api/electricity/history',
      '/api/electricity/rooms',
    ]) {
      const r = await request(route);
      assert.equal(r.status, 401);
      assert.match(r.headers.get('cache-control'), /no-store/);
    }
    assert.equal(
      (await request(`/api/electricity?roomId=${legacyId}`, 2)).status,
      404,
    );
    assert.equal(
      (await request(`/api/electricity?roomId=${b.id}`, 2)).status,
      404,
    );
    assert.equal(
      (await request(`/api/electricity?roomId=${a.id}`, 5)).status,
      403,
    );
    assert.equal(
      (await request(`/api/electricity?roomId=${a.id}`, 6)).status,
      404,
    );
    assert.equal(
      (await request(`/api/electricity?roomId=${a.id}`, 2)).status,
      200,
    );
    assert.equal(
      (await request(`/api/electricity?roomId=${legacyId}`, 1)).status,
      200,
    );
    assert.equal(
      (await request('/api/admin/electricity/rooms', 2)).status,
      403,
    );
    assert.equal(
      (
        await request(
          `/api/admin/electricity/settings?roomId=${a.id}`,
          2,
          'PUT',
          {},
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          `/api/admin/electricity/sync-history?roomId=${a.id}`,
          2,
          'POST',
          {},
        )
      ).status,
      403,
    );
    const settings = await (
      await request(`/api/admin/electricity/settings?roomId=${b.id}`, 1)
    ).json();
    assert.doesNotMatch(
      JSON.stringify(settings),
      /private-b|credentials_encrypted|credential_hash/,
    );
    const manage = `/api/electricity/rss/subscription?roomId=${a.id}`;
    const token = (await (await request(manage, 2, 'POST', {})).json()).data
      .url;
    assert.equal(
      (await request(token.replace(process.env.SITE_URL, ''))).status,
      200,
    );
    assert.equal(
      (
        await request(
          `/api/electricity/rss/subscription?roomId=${b.id}`,
          2,
          'POST',
          {},
        )
      ).status,
      404,
    );
    const oldCalls = collections;
    const feed = await request(token.replace(process.env.SITE_URL, ''));
    const xml = await feed.text();
    assert.match(xml, /mooncci 宿舍电量/);
    assert.ok(xml.includes(a.id));
    assert.equal(collections, oldCalls);
    const reset = (
      await (
        await request(
          `/api/electricity/rss/subscription/reset?roomId=${a.id}`,
          2,
          'POST',
          {},
        )
      ).json()
    ).data.url;
    assert.equal(
      (await request(token.replace(process.env.SITE_URL, ''))).status,
      404,
    );
    await rooms.updateRoom(a.id, { name: a.name, members: [] });
    assert.equal(
      (await request(reset.replace(process.env.SITE_URL, ''))).status,
      404,
    );
    await rooms.updateRoom(a.id, { name: a.name, members: ['friend-a'] });
    assert.equal(
      (await request(reset.replace(process.env.SITE_URL, ''))).status,
      404,
      're-adding does not revive revoked token',
    );
    await assert.rejects(rooms.updateRoom(legacyId, { members: ['friend-a'] }));
    const newUrl = (await (await request(manage, 2, 'POST', {})).json()).data
      .url;
    await rooms.updateRoom(a.id, { name: a.name, active: false });
    assert.equal(
      (await request(newUrl.replace(process.env.SITE_URL, ''))).status,
      404,
    );
    assert.equal(
      (await request(`/api/electricity?roomId=${a.id}`, 2)).status,
      404,
    );
    await assert.rejects(
      rooms.updateRoom(b.id, {
        name: b.name,
        account: 'different-meter',
        roomVerify: 'new-secret',
      }),
    );
    const badFeed = await request(
      '/api/electricity/rss/feed.xml?token=' + '0'.repeat(64),
    );
    assert.equal(badFeed.status, 404);
    // Sequential worker scan isolates mail failure and does not re-collect on retry.
    await rooms.updateRoom(a.id, { name: a.name, active: true });
    await rooms.inRoom(legacy, () =>
      repo.saveElectricityConfig({ enabled: false }),
    );
    await rooms.inRoom(a, () =>
      repo.saveElectricityConfig({ notifyTo: 'fail@example.test' }),
    );
    await db.query(
      "UPDATE electricity_rooms SET updated_at='2026-09-09 00:00:00'",
    );
    const scheduler = require('../src/jobs/electricityScheduler');
    const start = new Date('2026-09-10T07:00:00+08:00');
    const beforeTick = collections;
    await scheduler.tick(start);
    assert.equal(
      collections,
      beforeTick + 2,
      'both rooms execute even when first mail fails',
    );
    await scheduler.tick(start);
    assert.equal(collections, beforeTick + 2, 'repeated ticks are idempotent');
    await scheduler.tick(new Date('2026-09-10T07:16:00+08:00'));
    assert.equal(
      collections,
      beforeTick + 2,
      'mail retry reuses persisted report',
    );
    const [runs] = await db.query(
      'SELECT scope_key,status,attempts FROM electricity_room_runs WHERE run_date=?',
      ['2026-09-10'],
    );
    assert.equal(runs.find((r) => r.scope_key === a.scope_key).attempts, 2);
    assert.equal(
      runs.find((r) => r.scope_key === b.scope_key).status,
      'complete',
    );
    // Shared DB lock serializes calls across independent connections.
    const { schoolRequest } = require('../src/lib/electricityUpstreamQueue');
    let active = 0,
      maxActive = 0;
    const starts = [];
    await Promise.all(
      [1, 2].map(() =>
        schoolRequest(async () => {
          active++;
          maxActive = Math.max(active, maxActive);
          starts.push(Date.now());
          await new Promise((r) => setTimeout(r, 5));
          active--;
        }),
      ),
    );
    assert.equal(maxActive, 1);
    assert.ok(starts[1] - starts[0] >= 900);
  },
);

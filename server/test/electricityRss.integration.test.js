const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test(
  'private electricity RSS: real DB idempotency, SMTP failure, permissions, rotation and read-only feed',
  { skip: process.env.ELECTRICITY_RSS_INTEGRATION !== 'true' },
  async (t) => {
    assert.equal(process.env.DB_NAME, 'mooncci_electricity_rss_qa');
    assert.equal(process.env.DB_HOST, '127.0.0.1');
    process.env.JWT_SECRET = 'local-electricity-rss-test-only';
    process.env.ELECTRICITY_CREDENTIAL_KEY = 'ab'.repeat(32);
    process.env.ELECTRICITY_SCHOOL_ACCOUNT = 'test-account';
    process.env.ELECTRICITY_ROOM_VERIFY = 'test-room';
    process.env.ELECTRICITY_ENABLED = 'true';
    process.env.MAIL_ENABLED = 'false';
    process.env.SITE_URL = 'https://mooncci.example.test';
    process.env.CSRF_TRUSTED_ORIGINS = 'https://mooncci.example.test';
    const db = require('../src/db');
    t.after(() => db.end());
    await db.query(
      'CREATE TABLE IF NOT EXISTS users (id INT PRIMARY KEY, username VARCHAR(50), email VARCHAR(100), role VARCHAR(20), status VARCHAR(20), can_comment INT)',
    );
    await db.query(
      'CREATE TABLE IF NOT EXISTS site_settings (setting_key VARCHAR(100) PRIMARY KEY, setting_value TEXT)',
    );
    for (const file of [
      '202609010001_create_electricity_monitor.sql',
      '202609020001_add_electricity_email_slot.sql',
      '202609050002_create_electricity_reports.sql',
      '202609070001_create_electricity_daily_usage.sql',
      '202609090001_electricity_rooms.sql',
    ]) {
      const sql = fs.readFileSync(
        path.join(__dirname, '../database/migrations', file),
        'utf8',
      );
      for (const statement of sql
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)) {
        try {
          await db.query(statement);
        } catch (error) {
          if (
            ![
              'ER_DUP_FIELDNAME',
              'ER_CANT_DROP_FIELD_OR_KEY',
              'ER_DUP_KEYNAME',
            ].includes(error.code)
          )
            throw error;
        }
      }
    }
    for (const table of [
      'electricity_room_members',
      'electricity_rooms',
      'electricity_room_state',
      'electricity_room_runs',
      'electricity_midnight_snapshots',
      'electricity_daily_usage',
      'electricity_reports',
      'electricity_rss_subscriptions',
      'electricity_snapshots',
      'electricity_monitor_state',
      'site_settings',
      'users',
    ])
      await db.query(`DELETE FROM ${table}`);
    await db.query(
      "INSERT INTO users VALUES (1,'owner','one@example.invalid','owner','active',1),(2,'admin','two@example.invalid','admin','active',1),(3,'user','three@example.invalid','user','active',1),(4,'other owner','four@example.invalid','owner','active',1)",
    );
    const repository = require('../src/repositories/electricityRepository');
    await repository.saveElectricityConfig({
      enabled: true,
      dailyNotify: true,
    });
    await require('../src/repositories/electricityRoomRepository').migrateLegacy();
    const reports = require('../src/repositories/electricityReportRepository');
    const { currentScope } = require('../src/lib/electricityRssToken');
    let collections = 0,
      mails = 0,
      rejectMail = true,
      rejectCollection = false;
    const captured = [];
    t.mock.method(
      require('../src/lib/electricity'),
      'fetchElectricitySnapshot',
      async () => {
        collections++;
        if (rejectCollection)
          throw Object.assign(new Error('upstream unavailable'), {
            code: 'ELECTRICITY_NETWORK_ERROR',
          });
        return {
          meterId: 'meter-a',
          roomName: 'test-room',
          deviceName: '',
          status: '',
          totalRemaining: 53.75 - collections,
          purchasedRemaining: 30,
          subsidyRemaining: 23.75,
          todayUse: collections,
          price: 0.5,
        };
      },
    );
    t.mock.method(
      require('../src/lib/electricityMailer'),
      'sendElectricityDailyReport',
      async (data) => {
        mails++;
        captured.push(data);
        assert.ok(
          (await reports.getReport(
            currentScope(),
            data.snapshot.snapshotDate,
            data.period,
          )) || data.test,
        );
        if (rejectMail) throw new Error('mock SMTP failure');
        return { sent: true };
      },
    );
    t.mock.method(
      require('../src/lib/electricityMailer'),
      'sendElectricityLowAlert',
      async () => assert.fail('no extra alert in this fixture'),
    );
    const {
      runElectricityCycle,
      sendTestElectricityEmail,
    } = require('../src/services/electricityMonitor');
    await assert.rejects(
      runElectricityCycle({
        dailySlot: 'morning',
        now: new Date('2026-09-05T23:00:00Z'),
      }),
      /mock SMTP/,
    );
    let rows = await reports.listReports(currentScope());
    assert.equal(rows.length, 1);
    const morning = rows[0];
    assert.deepEqual(captured[0].snapshot, morning.snapshot);
    assert.deepEqual(captured[0].metrics, morning.metrics);
    rejectMail = false;
    await runElectricityCycle({
      dailySlot: 'morning',
      now: new Date('2026-09-05T23:05:00Z'),
    });
    assert.equal(collections, 1);
    assert.equal(mails, 2);
    assert.equal((await reports.listReports(currentScope()))[0].id, morning.id);
    await runElectricityCycle({
      dailySlot: 'morning',
      now: new Date('2026-09-05T23:06:00Z'),
    });
    assert.equal(mails, 2);
    await runElectricityCycle({
      dailySlot: null,
      now: new Date('2026-09-06T04:00:00Z'),
    });
    assert.equal((await reports.listReports(currentScope())).length, 1);
    await sendTestElectricityEmail();
    assert.equal((await reports.listReports(currentScope())).length, 1);
    await runElectricityCycle({
      dailySlot: 'evening',
      now: new Date('2026-09-06T13:00:00Z'),
    });
    rows = await reports.listReports(currentScope());
    assert.equal(rows.length, 2);
    assert.notEqual(rows[0].id, rows[1].id);
    assert.equal(rows[0].metrics.balanceChange, -1);
    assert.equal(rows[0].snapshot.todayUse, 3);
    assert.match(rows[0].metrics.comparisonAt, /T04:00:00/);
    // Concurrent inserts and a conflicting retry preserve the first committed payload.
    await Promise.all(
      Array.from({ length: 4 }, () =>
        reports.saveReport(currentScope(), {
          ...rows[0],
          id: undefined,
          collectionStatus: 'must not overwrite',
        }),
      ),
    );
    assert.equal((await reports.listReports(currentScope())).length, 2);
    assert.equal(
      (await reports.listReports(currentScope()))[0].collectionStatus,
      '采集成功',
    );
    rejectCollection = true;
    await assert.rejects(
      runElectricityCycle({
        dailySlot: 'morning',
        now: new Date('2026-09-06T23:00:00Z'),
      }),
    );
    rows = await reports.listReports(currentScope());
    assert.match(rows[0].collectionStatus, /采集异常/);
    assert.equal(rows[0].snapshot.totalRemaining, null);
    // Turning off daily email delivery must not disable scheduled RSS reports.
    rejectCollection = false;
    await repository.saveElectricityConfig({ dailyNotify: false });
    const mailCount = mails;
    await runElectricityCycle({
      dailySlot: 'evening',
      now: new Date('2026-09-07T13:00:00Z'),
    });
    assert.equal(mails, mailCount);
    assert.equal((await reports.listReports(currentScope())).length, 4);
    const beforeRead = { collections, mails };
    const app = require('../src/index');
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    const jwt = require('jsonwebtoken');
    const request = (url, id, options = {}) =>
      fetch(base + url, {
        ...options,
        headers: {
          ...(id
            ? {
                Cookie: `mooncci_token=${jwt.sign({ id }, process.env.JWT_SECRET)}`,
              }
            : {}),
          ...(options.headers || {}),
        },
      });
    const manage = '/api/electricity/rss/subscription';
    const write = {
      method: 'POST',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        Origin: process.env.SITE_URL,
      },
    };
    assert.equal((await request(manage)).status, 401);
    for (const id of [2, 3])
      assert.equal((await request(manage, id)).status, 404);
    assert.equal((await request(manage, 1, { method: 'POST' })).status, 403);
    assert.equal(
      (
        await request(manage, 1, {
          ...write,
          headers: { ...write.headers, Origin: 'https://evil.example' },
        })
      ).status,
      403,
    );
    assert.equal((await (await request(manage, 1)).json()).data.url, null);
    const created = await (await request(manage, 1, write)).json();
    const token = new URL(created.data.url).searchParams.get('token');
    assert.match(token, /^[a-f0-9]{64}$/);
    assert.equal(
      (await (await request(manage, 1, write)).json()).data.url,
      created.data.url,
    );
    assert.equal(
      (await (await request(`${manage}?user_id=1`, 4)).json()).data.url,
      null,
    );
    const feedPath = `/api/electricity/rss/feed.xml?token=${token}`;
    const feed = await request(feedPath);
    assert.equal(feed.status, 200);
    assert.match(
      feed.headers.get('content-type'),
      /application\/rss\+xml; charset=utf-8/i,
    );
    assert.match(feed.headers.get('cache-control'), /no-store/);
    const xml = await feed.text();
    assert.equal((xml.match(/<item>/g) || []).length, 4);
    assert.ok(!xml.includes(token));
    if (process.env.ELECTRICITY_RSS_XML_OUTPUT)
      fs.writeFileSync(process.env.ELECTRICITY_RSS_XML_OUTPUT, xml);
    assert.deepEqual({ collections, mails }, beforeRead);
    assert.equal(
      (await request('/api/electricity/rss/feed.xml?token=invalid')).status,
      404,
    );
    const reset = await (await request(`${manage}/reset`, 1, write)).json();
    assert.notEqual(reset.data.url, created.data.url);
    assert.equal((await request(feedPath)).status, 404);
    const newPath =
      new URL(reset.data.url).pathname + new URL(reset.data.url).search;
    assert.equal((await request(newPath)).status, 200);
    process.env.ELECTRICITY_ROOM_VERIFY = 'another-room';
    assert.equal(
      (await request(newPath)).status,
      200,
      'stored room identity is independent of legacy environment changes',
    );
    process.env.ELECTRICITY_ROOM_VERIFY = 'test-room';
    await db.query("UPDATE users SET status='disabled' WHERE id=1");
    assert.equal((await request(newPath)).status, 404);
    await db.query("UPDATE users SET status='active',role='admin' WHERE id=1");
    assert.equal((await request(newPath)).status, 404);
    await db.query("UPDATE users SET role='owner' WHERE id=1");
    // RSS return limit is not a retention policy.
    for (let i = 0; i < 65; i++)
      await reports.saveReport('b'.repeat(64), {
        ...morning,
        id: undefined,
        reportDate: new Date(Date.UTC(2026, 0, i + 1))
          .toISOString()
          .slice(0, 10),
        publishedAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
      });
    assert.equal((await reports.listReports('b'.repeat(64))).length, 60);
    const [count] = await db.query(
      'SELECT COUNT(*) AS n FROM electricity_reports WHERE scope_key=?',
      ['b'.repeat(64)],
    );
    assert.equal(count[0].n, 65);
    // Midnight capture is independent of both email/RSS report periods.
    rejectCollection = false;
    const daily = require('../src/repositories/electricityDailyUsageRepository');
    // Monitor destructures dependencies at load, so mock the HTTP request of daily history.
    const beforeMidnight = {
      collections,
      mails,
      reports: (await reports.listReports(currentScope())).length,
    };
    t.mock.method(global, 'fetch', async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          code_: 0,
          result_: true,
          body: JSON.stringify({
            result: 0,
            dayuselist: [
              { date: '2026-09-06', use: 6 },
              { date: '2026-09-07', use: 9 },
              { date: '2026-09-08', use: 9 },
            ],
          }),
        }),
    }));
    const midnight = new Date('2026-09-09T00:00:00+08:00');
    await runElectricityCycle({ midnight: true, now: midnight });
    const frozen = await daily.getForecast(midnight, 'meter-a');
    assert.equal(frozen.averageDailyUse, 8);
    assert.equal(frozen.usageSampleDays, 3);
    assert.equal(frozen.estimatedDaysRemaining, (53.75 - collections) / 8);
    assert.equal(mails, beforeMidnight.mails);
    assert.equal(
      (await reports.listReports(currentScope())).length,
      beforeMidnight.reports,
    );
    await runElectricityCycle({ midnight: true, now: midnight });
    assert.equal(collections, beforeMidnight.collections + 1);
    const saved = await daily.getBoundary(currentScope(), '2026-09-09');
    await Promise.all([
      daily.saveBoundary({ ...saved, totalRemaining: 999 }, []),
      daily.saveBoundary(saved, []),
    ]);
    assert.deepEqual(
      await daily.getForecast(new Date('2026-09-09T21:00:00+08:00'), 'meter-a'),
      frozen,
    );
    assert.equal((await daily.getDailyHistory(7, midnight)).length, 3);
    assert.equal(
      (await daily.getForecast(midnight, 'new-meter')).estimatedDaysRemaining,
      null,
    );
    const skipped = await runElectricityCycle({
      midnight: true,
      now: new Date('2026-09-10T07:00:00+08:00'),
    });
    assert.equal(skipped.reason, 'missed_midnight_window');
    assert.equal(collections, beforeMidnight.collections + 1);
    await repository.saveElectricityConfig({ dailyNotify: true });
    rejectMail = true;
    await assert.rejects(
      runElectricityCycle({
        dailySlot: 'morning',
        now: new Date('2026-09-09T07:00:00+08:00'),
      }),
      /mock SMTP/,
    );
    const freshReport = await reports.getReport(
      currentScope(),
      '2026-09-09',
      'morning',
    );
    assert.equal(freshReport.metrics.averageDailyUse, frozen.averageDailyUse);
    assert.equal(
      freshReport.metrics.estimatedDaysRemaining,
      frozen.estimatedDaysRemaining,
    );
    assert.equal(freshReport.metrics.forecastAt, frozen.forecastAt);
    rejectMail = false;
    await runElectricityCycle({
      dailySlot: 'morning',
      now: new Date('2026-09-09T07:05:00+08:00'),
    });
    assert.equal(
      (await reports.getReport(currentScope(), '2026-09-09', 'morning')).id,
      freshReport.id,
    );
    const mailsAfterMorning = mails;
    // An upstream history outage retains the real boundary; it does not fabricate a daily use.
    t.mock.method(global, 'fetch', async () => {
      throw new Error('offline');
    });
    await runElectricityCycle({
      midnight: true,
      now: new Date('2026-09-10T00:00:00+08:00'),
    });
    const failedHistory = await daily.getBoundary(currentScope(), '2026-09-10');
    assert.equal(failedHistory.historyError, 'ELECTRICITY_NETWORK_ERROR');
    assert.equal(
      (await daily.getDailyHistory(7, new Date('2026-09-10T00:00:00+08:00')))[0]
        .usage,
      null,
    );
    assert.equal(mails, mailsAfterMorning);
    const storedReading = await repository.upsertSnapshot(
      {
        meterId: 'meter-a',
        roomName: '',
        deviceName: '',
        status: '',
        todayUse: 0,
        totalRemaining: 40,
        purchasedRemaining: 20,
        subsidyRemaining: 20,
        price: 0.5,
        cumulativeReading: 1234.567891,
        cumulativeReadingSource: 'record.actualReading',
      },
      '2026-09-10',
      new Date('2026-09-10T12:00:00+08:00'),
    );
    assert.equal(storedReading.cumulativeReading, 1234.567891);
    assert.equal(storedReading.cumulativeReadingSource, 'record.actualReading');
  },
);

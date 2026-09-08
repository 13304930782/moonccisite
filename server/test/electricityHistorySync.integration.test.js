const test = require('node:test');
const assert = require('node:assert/strict');
test(
  'first history import persists school days without creating reports or midnight forecasts',
  { skip: process.env.ELECTRICITY_HISTORY_INTEGRATION !== 'true' },
  async (t) => {
    assert.equal(process.env.DB_NAME, 'mooncci_electricity_rss_qa');
    assert.equal(process.env.DB_HOST, '127.0.0.1');
    process.env.ELECTRICITY_SCHOOL_ACCOUNT = 'history-test-account';
    process.env.ELECTRICITY_ROOM_VERIFY = 'history-test-room';
    const db = require('../src/db');
    t.after(() => db.end());
    const repo = require('../src/repositories/electricityDailyUsageRepository');
    const { currentScope } = require('../src/lib/electricityRssToken');
    const { normalizeSchoolDays } = require('../src/lib/electricityDailyUsage');
    const scope = currentScope(),
      now = new Date('2026-09-07T14:00:00+08:00');
    await db.query('DELETE FROM electricity_daily_usage WHERE scope_key=?', [
      scope,
    ]);
    await db.query(
      'DELETE FROM electricity_midnight_snapshots WHERE scope_key=?',
      [scope],
    );
    await db.query('DELETE FROM site_settings WHERE setting_key=?', [
      `electricity_history_sync:${scope}`,
    ]);
    let calls = 0,
      fail = false,
      latePublished = false;
    const upstream = require('../src/lib/electricity');
    t.mock.method(upstream, 'fetchElectricitySnapshot', async () => ({
      meterId: 'test-meter',
      totalRemaining: 40,
    }));
    t.mock.method(upstream, 'fetchElectricityDailyUsage', async (options) => {
      calls++;
      if (fail)
        throw Object.assign(new Error('private response must not be logged'), {
          code: 'ELECTRICITY_NETWORK_ERROR',
        });
      return normalizeSchoolDays(
        [
          ...[7.9, 7.6, 5.9, 7.25, 8.43, 8.36, 8.24].map((use, i) => ({
            date: i === 0 ? '2026-08-31' : `2026-09-0${i}`,
            use,
          })),
          ...(latePublished ? [{ date: '2026-09-07', use: 8.66 }] : []),
        ],
        options.now,
      );
    });
    const {
      syncElectricityHistory,
    } = require('../src/services/electricityHistorySync');
    const [[before]] = await db.query(
      'SELECT (SELECT COUNT(*) FROM electricity_reports) AS reports, (SELECT COUNT(*) FROM electricity_snapshots) AS snapshots',
    );
    const result = await syncElectricityHistory({ onlyIfMissing: true, now });
    assert.deepEqual(result, { status: 'synced', count: 7 });
    const history = await repo.getDailyHistory(7, now);
    assert.equal(history.length, 7);
    assert.equal(history[0].usage, 8.24);
    assert.ok(
      history.every(
        (row) => row.method === 'school_daily' && row.meterId === 'test-meter',
      ),
    );
    assert.equal(await repo.getBoundary(scope, '2026-09-07'), null);
    assert.equal((await repo.getForecast(now)).estimatedDaysRemaining, null);
    const [[after]] = await db.query(
      'SELECT (SELECT COUNT(*) FROM electricity_reports) AS reports, (SELECT COUNT(*) FROM electricity_snapshots) AS snapshots',
    );
    assert.deepEqual(after, before);
    assert.equal(
      (await syncElectricityHistory({ onlyIfMissing: true, now })).status,
      'already_imported',
    );
    assert.equal((await syncElectricityHistory({ now })).status, 'cooldown');
    assert.equal(calls, 1);
    const later = new Date(now.getTime() + 16 * 60000);
    const lock = await repo.acquireHistoryLock(scope);
    assert.equal((await syncElectricityHistory({ now: later })).status, 'busy');
    await repo.releaseHistoryLock(lock, scope);
    await syncElectricityHistory({ now: later });
    assert.equal((await repo.getDailyHistory(7, now)).length, 7);
    assert.equal(calls, 2);
    // A real midnight forecast remains unchanged when a later manual import updates day rows.
    await repo.saveBoundary(
      {
        scopeKey: scope,
        meterId: 'test-meter',
        snapshotDate: '2026-09-07',
        recordedAt: '2026-09-07T00:00:00+08:00',
        totalRemaining: 40,
      },
      history,
    );
    const frozen = await repo.getForecast(now, 'test-meter');
    await syncElectricityHistory({ now: new Date(now.getTime() + 32 * 60000) });
    assert.deepEqual(await repo.getForecast(now, 'test-meter'), frozen);
    fail = true;
    await assert.rejects(
      syncElectricityHistory({ now: new Date(now.getTime() + 48 * 60000) }),
      (error) => error.code === 'ELECTRICITY_NETWORK_ERROR',
    );
    assert.equal((await repo.getDailyHistory(7, now)).length, 7);
    const failedLock = await repo.acquireHistoryLock(scope);
    const state = await repo.getSyncState(failedLock, scope);
    await repo.releaseHistoryLock(failedLock, scope);
    assert.equal(state.status, 'failed');
    assert.equal(state.errorCode, 'ELECTRICITY_NETWORK_ERROR');
    assert.doesNotMatch(JSON.stringify(state), /private response/);
    // Reproduce the production gap: midnight receives only Sep 1–6. Having
    // older history must not prevent the next daytime slot importing Sep 7.
    fail = false;
    const midnight = new Date('2026-09-08T00:00:00+08:00');
    await repo.saveBoundary(
      {
        scopeKey: scope,
        meterId: 'test-meter',
        snapshotDate: '2026-09-08',
        recordedAt: midnight.toISOString(),
        totalRemaining: 32.5,
      },
      await repo.getDailyHistory(7, midnight),
    );
    const frozenNext = await repo.getForecast(midnight, 'test-meter');
    assert.equal(
      (await syncElectricityHistory({ onlyIfMissing: true, now: midnight }))
        .count,
      6,
    );
    latePublished = true;
    const morning = new Date('2026-09-08T07:00:00+08:00');
    assert.deepEqual(
      await syncElectricityHistory({ onlyIfMissing: true, now: morning }),
      { status: 'synced', count: 7 },
    );
    const imported = await repo.getDailyHistory(7, morning);
    assert.equal(imported[0].usageDate, '2026-09-07');
    assert.equal(imported[0].usage, 8.66);
    assert.equal(imported[0].method, 'school_daily');
    assert.deepEqual(await repo.getForecast(morning, 'test-meter'), frozenNext);
    const callsAfterImport = calls;
    assert.equal(
      (
        await syncElectricityHistory({
          onlyIfMissing: true,
          now: new Date('2026-09-08T12:00:00+08:00'),
        })
      ).status,
      'already_imported',
    );
    assert.equal(
      calls,
      callsAfterImport,
      'do not query school again once yesterday is available',
    );
    const [[finalCounts]] = await db.query(
      'SELECT (SELECT COUNT(*) FROM electricity_reports) AS reports, (SELECT COUNT(*) FROM electricity_snapshots) AS snapshots',
    );
    assert.deepEqual(finalCounts, before);
  },
);

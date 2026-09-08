const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildReport,
  renderElectricityRss,
} = require('../src/lib/electricityReport');
const {
  currentScope,
  seal,
  unseal,
} = require('../src/lib/electricityRssToken');

const now = new Date('2026-09-05T13:00:00Z');
const config = { lowTotalThreshold: 20, lowPurchaseThreshold: 10 };
const snapshot = {
  snapshotDate: '2026-09-05',
  recordedAt: now.toISOString(),
  meterId: 'a',
  scopeKey: 'scope-a',
  totalRemaining: 53.75,
  purchasedRemaining: 30,
  subsidyRemaining: 23.75,
  todayUse: 3,
  price: 0.5,
};

test('report distinguishes intraday balance delta from today usage and retains zero/missing values', () => {
  const previous = {
    ...snapshot,
    totalRemaining: 60,
    recordedAt: '2026-09-05T04:00:00Z',
  };
  const history = [0, 3, 3].map((usage, index) => ({
    ...snapshot,
    todayUse: usage,
    snapshotDate: `2026-09-0${3 + index}`,
  }));
  history.push({ ...snapshot, meterId: 'other-room', todayUse: 999 });
  const report = buildReport({
    snapshot,
    previous,
    history,
    config,
    period: 'evening',
    now,
  });
  assert.equal(report.metrics.balanceChange, -6.25);
  assert.equal(report.snapshot.todayUse, 3);
  assert.equal(report.metrics.comparisonAt, previous.recordedAt);
  assert.equal(report.metrics.averageDailyUse, null); // Intraday history is never used for new forecasts.
  assert.equal(report.metrics.estimatedDaysRemaining, null);
  const unknown = buildReport({
    snapshot: { ...snapshot, totalRemaining: null },
    config,
    period: 'morning',
    now,
  });
  assert.equal(unknown.status, 'unknown');
  assert.equal(unknown.metrics.estimatedDaysRemaining, null);
  assert.match(unknown.collectionStatus, /缺失/);
  assert.doesNotMatch(JSON.stringify(unknown), /meterId/);
});

test('RSS has stable identifiers, timezone dates, escaped compatible HTML and no invented estimates', () => {
  const report = {
    id: 'stable-id',
    ...buildReport({
      snapshot: null,
      config,
      period: 'morning',
      now,
      failed: true,
    }),
  };
  report.collectionStatus += ' <异常 & 中文>\u0001';
  const feed = renderElectricityRss([report], 'https://example.test');
  assert.match(feed, /<rss version="2.0">/);
  assert.match(feed, /urn:mooncci:electricity-report:stable-id/);
  assert.match(feed, /Sat, 05 Sep 2026 21:00:00 \+0800/);
  assert.match(feed, /电量早报｜余量未知/);
  assert.match(feed, /&amp;lt;异常 &amp;amp; 中文&amp;gt;/);
  assert.doesNotMatch(feed, /\u0001|<script|<style|token=|0\.00/);
  assert.equal(
    (renderElectricityRss([], 'https://example.test').match(/<item>/g) || [])
      .length,
    0,
  );
  const stale = buildReport({
    snapshot: { ...snapshot, recordedAt: '2026-09-03T13:00:00Z' },
    config,
    period: 'evening',
    now,
  });
  assert.equal(stale.status, 'unknown');
  assert.match(stale.collectionStatus, /过期/);
});

test('subscription encryption authenticates user/scope and fails closed after key changes', () => {
  const old = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-only-secret';
  try {
    const encrypted = seal('private-token', '1:room-a');
    assert.equal(unseal(encrypted, '1:room-a'), 'private-token');
    assert.throws(() => unseal(encrypted, '2:room-a'));
    process.env.JWT_SECRET = 'another-test-secret';
    assert.throws(() => unseal(encrypted, '1:room-a'));
    assert.notEqual(
      currentScope({
        ELECTRICITY_SCHOOL_ACCOUNT: 'a',
        ELECTRICITY_ROOM_VERIFY: 'room-a',
      }),
      currentScope({
        ELECTRICITY_SCHOOL_ACCOUNT: 'a',
        ELECTRICITY_ROOM_VERIFY: 'room-b',
      }),
    );
  } finally {
    if (old === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = old;
  }
});

test('scheduled mail renders the persisted report fields with the existing button template', async (t) => {
  const mailer = require('../src/lib/mailer');
  t.mock.method(mailer, 'getMailConfig', async () => ({
    site_url: 'https://example.test',
    notify_to: 'test@example.invalid',
  }));
  let captured;
  t.mock.method(mailer, 'sendMail', async (message) => {
    captured = message;
    return { sent: true };
  });
  const {
    sendElectricityDailyReport,
  } = require('../src/lib/electricityMailer');
  const report = buildReport({
    snapshot: { ...snapshot, todayUse: null },
    config,
    period: 'evening',
    now,
  });
  await sendElectricityDailyReport({
    report,
    snapshot: report.snapshot,
    metrics: report.metrics,
    status: report.status,
    period: report.period,
  });
  assert.match(captured.text, /今日用电（截至采集时）：数据不足/);
  assert.match(captured.text, /比较基准时间：未知/);
  assert.match(captured.html, /data-mail-button/);
  assert.match(captured.html, /data-mail-fallback/);
  assert.match(captured.html, /采集完成，部分数据缺失/);
  assert.doesNotMatch(captured.text, /今日用电（截至采集时）：0/);
});

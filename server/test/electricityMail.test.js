const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReport, mailFields, renderElectricityRss } = require('../src/lib/electricityReport');
const now = new Date('2026-10-17T01:00:00Z');
const snapshot = { scopeKey: 'test-scope', meterId: 'test-meter', snapshotDate: '2026-10-17', recordedAt: now.toISOString(), totalRemaining: 50, purchasedRemaining: 20, subsidyRemaining: 30, todayUse: 0, price: .5, cumulativeReading: null };
const forecast = { method: 'midnight_daily_v1', completedDayDate: '2026-10-16', completedDayUse: null, completedDayStatus: 'missing_reading', estimatedDaysRemaining: null };
const args = { snapshot, forecast, now, period: 'morning', config: {} };
const row = { usageDate: '2026-10-16', meterId: 'test-meter', usage: 4.2, status: 'valid', method: 'school_daily' };

test('mail shows captured today usage without changing frozen RSS forecast', () => {
  const old = buildReport(args), current = buildReport({ ...args, dailyRows: [row] });
  assert.equal(current.mailDaily.usage, 4.2);
  assert.equal(current.metrics.completedDayUse, null);
  assert.equal(current.snapshot.cumulativeReading, null);
  assert.equal(renderElectricityRss([old], 'https://example.test'), renderElectricityRss([current], 'https://example.test'));
  assert.doesNotMatch(JSON.stringify(mailFields(current)), /完整日|4\.20|累计读数缺失/);
  assert.equal(mailFields(current).length, 5);
  assert.equal(mailFields(current).find(([label]) => label.startsWith('今日'))[1], '0.00 kWh');
  assert.doesNotMatch(JSON.stringify(mailFields(current)), /数据不足 kWh|电表累计读数/);
});

test('mail preserves genuine missing data, zero and wrong-meter isolation', () => {
  for (const candidate of [{ ...row, usage: null, status: 'missing_value' }, { ...row, meterId: 'other-meter' }, { ...row, usageDate: '2026-10-17' }, { ...row, usage: -1 }]) {
    const report = buildReport({ ...args, dailyRows: [candidate] });
    assert.equal(report.mailDaily.usage, null);
    assert.doesNotMatch(JSON.stringify(mailFields(report)), /完整日|累计读数缺失/);
  }
  assert.equal(buildReport({ ...args, dailyRows: [{ ...row, usage: 0 }] }).mailDaily.usage, 0);
  const missing = buildReport({ ...args, dailyRows: [] });
  assert.equal(mailFields(missing).find(([label]) => label.startsWith('今日'))[1], '0.00 kWh');
  const legacy = buildReport(args);
  assert.doesNotMatch(JSON.stringify(mailFields(legacy)), /完整日|累计读数缺失/);
  const unavailable = buildReport({ ...args, snapshot: { ...snapshot, todayUse: null } });
  assert.equal(mailFields(unavailable).find(([label]) => label.startsWith('今日'))[1], '未提供');
  assert.equal(legacy.mailDaily, undefined);
});

test('real mail HTML and text use compact fields; retry preserves captured total', async (t) => {
  const mailerPath = require.resolve('../src/lib/mailer');
  const target = require.resolve('../src/lib/electricityMailer');
  const original = require.cache[mailerPath];
  const messages = [];
  require.cache[mailerPath] = { id: mailerPath, filename: mailerPath, loaded: true, exports: {
    getMailConfig: async () => ({ site_url: 'https://example.test', notify_to: 'local@example.test' }),
    safeSiteUrl: (url) => url,
    sendMail: async (message) => { messages.push(message); return { sent: true }; },
  }};
  delete require.cache[target];
  t.after(() => { if (original) require.cache[mailerPath] = original; else delete require.cache[mailerPath]; delete require.cache[target]; });
  const { sendElectricityDailyReport } = require(target);
  const report = buildReport({ ...args, snapshot: { ...snapshot, todayUse: 6.15 }, forecast: { ...forecast, estimatedDaysRemaining: 10 }, dailyRows: [row] });
  const saved = JSON.parse(JSON.stringify(report));
  for (const item of [saved, buildReport({ ...args, dailyRows: [] })]) {
    await sendElectricityDailyReport({ snapshot: item.snapshot, report: item, period: 'morning' });
  }
  for (const format of ['html', 'text']) {
    assert.match(messages[0][format], /6\.15 kWh/);
    assert.equal(messages[0][format].match(/今日用电（截至采集时）/g).length, 1);
    assert.doesNotMatch(messages[0][format], /完整日|累计读数缺失|4\.20 kWh/);
  }
  assert.doesNotMatch(messages[0].html, /电表累计读数|比较基准时间/);
  assert.match(messages[1].html, /0\.00 kWh/);
  assert.doesNotMatch(messages[1].html, /完整日|待结算或同步/);
  if (process.env.ELECTRICITY_MAIL_PREVIEW_DIR) {
    const fs = require('node:fs'), path = require('node:path');
    fs.mkdirSync(process.env.ELECTRICITY_MAIL_PREVIEW_DIR, { recursive: true });
    messages.forEach((message, i) => fs.writeFileSync(path.join(process.env.ELECTRICITY_MAIL_PREVIEW_DIR, i ? 'missing.html' : 'normal.html'), message.html));
  }
});

for (const historyFails of [false, true]) test(`scheduled collection persists report and retries without recollection (history failure: ${historyFails})`, async (t) => {
  const source = require('../src/lib/electricity');
  const context = require('../src/lib/electricityContext');
  const repository = require('../src/repositories/electricityRepository');
  const reports = require('../src/repositories/electricityReportRepository');
  const daily = require('../src/repositories/electricityDailyUsageRepository');
  let saved = null, historyReads = 0, collections = 0;
  const historyCalls = [];
  t.mock.method(context, 'electricityEnv', () => ({ ELECTRICITY_SCHOOL_ACCOUNT: 'local-test', ELECTRICITY_ROOM_VERIFY: 'local-test' }));
  t.mock.method(source, 'fetchElectricitySnapshot', async () => { collections++; return snapshot; });
  t.mock.method(repository, 'getElectricityConfig', async () => ({ enabled: true, dailyNotify: false, lowTotalThreshold: 10, lowPurchaseThreshold: 5 }));
  t.mock.method(repository, 'getLatestSnapshot', async () => snapshot);
  t.mock.method(repository, 'upsertSnapshot', async (value) => value);
  t.mock.method(repository, 'markCollectionSuccess', async () => {});
  t.mock.method(repository, 'getMonitorState', async () => ({ lowAlertActive: false }));
  t.mock.method(reports, 'getReport', async () => saved);
  t.mock.method(reports, 'saveReport', async (_scope, report) => (saved = JSON.parse(JSON.stringify(report))));
  t.mock.method(daily, 'getForecast', async () => forecast);
  t.mock.method(daily, 'getDailyHistory', async (days, time) => { historyReads++; historyCalls.push([days, time]); if (historyFails) throw new Error('isolated history unavailable'); return [row]; });
  const mailer = require('../src/lib/electricityMailer');
  let testMailReport;
  t.mock.method(mailer, 'sendElectricityDailyReport', async ({ report }) => { testMailReport = report; return { sent: true }; });
  const servicePath = require.resolve('../src/services/electricityMonitor');
  delete require.cache[servicePath];
  t.after(() => delete require.cache[servicePath]);
  const { runElectricityCycle, sendTestElectricityEmail } = require(servicePath);
  const first = await runElectricityCycle({ dailySlot: 'morning', now });
  assert.ok(saved);
  assert.equal(first.report.mailDaily?.usage, historyFails ? undefined : 4.2);
  assert.equal(first.report.metrics.completedDayUse, null);
  assert.deepEqual(historyCalls, [[7, now]]);
  const retry = await runElectricityCycle({ dailySlot: 'morning', now });
  assert.deepEqual(retry.report, first.report);
  assert.equal(historyReads, 1);
  assert.equal(collections, 1);
  const testMail = await sendTestElectricityEmail();
  assert.equal(testMail.daily.sent, true);
  assert.ok(testMailReport);
  if (historyFails) assert.equal(testMailReport.mailDaily, undefined);
});

test('electricity mail cards escape report text and reject unsafe actions', () => {
  const { renderElectricityDailyEmail } = require('../src/lib/electricityMailTemplate');
  const report = buildReport({ ...args, dailyRows: [] });
  report.collectionStatus = '<img src=x onerror=alert(1)>';
  report.mailDaily.date = '<script>bad()</script>';
  const html = renderElectricityDailyEmail({ report, label: '<svg onload=alert(1)>', url: 'javascript:alert(1)' });
  assert.match(html, /data-electricity-total/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /bad\(\)/);
  assert.doesNotMatch(html, /<script|<img|<svg|href="javascript:/);
});

const { finiteNumber, classifyElectricity } = require('./electricityMetrics');
const { getBusinessDate, getBusinessDateTime } = require('./electricityTime');
const { calculateMidnightForecast } = require('./electricityDailyUsage');
const { xml } = require('./contentPlatform');

function number(value, digits = 2) {
  const parsed = finiteNumber(value);
  return parsed === null ? '数据不足' : parsed.toFixed(digits);
}
function timestamp(value) {
  if (!value) return '未知';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? `${getBusinessDateTime(date)} +08:00`
    : '未知';
}
function buildReport({
  snapshot,
  previous,
  forecast = null,
  config,
  period,
  now,
  failed = false,
}) {
  const reportDate = getBusinessDate(now);
  const source = snapshot || {};
  // Daily rows from another configured meter must not enter this scope's report.
  const matching = (item) =>
    Boolean(source.scopeKey) &&
    item?.scopeKey === source.scopeKey &&
    Boolean(source.meterId) &&
    item?.meterId === source.meterId;
  const prior =
    matching(previous) &&
    new Date(previous.recordedAt) < new Date(source.recordedAt)
      ? previous
      : null;
  const total = finiteNumber(source.totalRemaining);
  const priorTotal = finiteNumber(prior?.totalRemaining);
  const collected = new Date(source.recordedAt).getTime();
  const stale =
    !Number.isFinite(collected) ||
    now.getTime() - collected > 24 * 3600000 ||
    collected > now.getTime();
  const missing = [
    'totalRemaining',
    'purchasedRemaining',
    'subsidyRemaining',
    'todayUse',
    'price',
  ].some((field) => finiteNumber(source[field]) === null);
  const collectionStatus = failed
    ? '采集异常，本时段没有新数据'
    : stale
      ? '数据已过期或采集时间未知'
      : missing
        ? '采集完成，部分数据缺失'
        : '采集成功';
  const metrics = {
    ...(forecast || calculateMidnightForecast([], null, now)),
    balanceChange:
      total !== null && priorTotal !== null ? total - priorTotal : null,
    comparisonAt: prior?.recordedAt || null,
    estimatedDaysRemaining:
      !failed && !stale ? (forecast?.estimatedDaysRemaining ?? null) : null,
  };
  const safeSnapshot = Object.fromEntries(
    [
      'snapshotDate',
      'recordedAt',
      'todayUse',
      'cumulativeReading',
      'purchasedRemaining',
      'subsidyRemaining',
      'totalRemaining',
      'price',
    ].map((field) => [field, source[field] ?? null]),
  );
  return {
    reportDate,
    period,
    publishedAt: now.toISOString(),
    snapshot: safeSnapshot,
    metrics,
    status:
      failed || stale || missing
        ? 'unknown'
        : classifyElectricity(source, config),
    collectionOutcome: failed
      ? 'failed'
      : stale
        ? 'stale'
        : missing
          ? 'partial'
          : 'success',
    collectionStatus,
  };
}
function reportFields(report) {
  const s = report.snapshot || {},
    m = report.metrics || {};
  return [
    ['报告日期', report.reportDate],
    ['报告生成时间', timestamp(report.publishedAt)],
    ['采集时间', timestamp(s.recordedAt)],
    ['采集状态', report.collectionStatus || '未知'],
    ['总余量', `${number(s.totalRemaining)} kWh`],
    ['已购余量', `${number(s.purchasedRemaining)} kWh`],
    ['补贴余量', `${number(s.subsidyRemaining)} kWh`],
    ['今日用电（截至采集时）', `${number(s.todayUse)} kWh`],
    ...(m.method === 'midnight_daily_v1'
      ? [
          ['最近完整日', m.completedDayDate || '未知'],
          [
            '完整日用电（00:00 至次日 00:00）',
            `${number(m.completedDayUse)} kWh`,
          ],
          ['电表累计读数', `${number(s.cumulativeReading)} kWh`],
          ['预测基准时间', timestamp(m.forecastAt)],
          ['预测基准余量', `${number(m.forecastRemaining)} kWh`],
        ]
      : []),
    ['当前电价', `${number(s.price)} 元/kWh`],
    [
      '较前次变化（余额差，非今日用电）',
      `${finiteNumber(m.balanceChange) > 0 ? '+' : ''}${number(m.balanceChange)} kWh`,
    ],
    ['比较基准时间', timestamp(m.comparisonAt)],
    [
      '7 日平均用电',
      m.method === 'midnight_daily_v1'
        ? `${number(m.averageDailyUse)} kWh/天（最近 7 个已结束自然日中 ${m.usageSampleDays || 0} 天有效数据，不含今日）`
        : `${number(m.averageDailyUse)} kWh/天（历史报告口径：含当日截至采集时的用电）`,
    ],
    ['预计可用天数', `${number(m.estimatedDaysRemaining, 1)} 天`],
  ];
}
function rssDate(value) {
  return new Date(new Date(value).getTime() + 8 * 3600000)
    .toUTCString()
    .replace('GMT', '+0800');
}
function renderElectricityRss(reports, origin, roomId) {
  const link = `${origin}/electricity${roomId ? `?roomId=${encodeURIComponent(roomId)}` : ''}`;
  const items = reports
    .map((report) => {
      const period = report.period === 'morning' ? '早报' : '晚报';
      const remaining = number(report.snapshot?.totalRemaining);
      const days = finiteNumber(report.metrics?.estimatedDaysRemaining);
      const title = `电量${period}｜${remaining === '数据不足' ? '余量未知' : `剩余 ${remaining} 度`}${days === null ? '' : ` · 预计可用 ${days.toFixed(1)} 天`}`;
      const html = `<h2>${xml(`电量${period}`)}</h2><ul>${reportFields(report)
        .map(
          ([label, value]) =>
            `<li><strong>${xml(label)}：</strong>${xml(value)}</li>`,
        )
        .join('')}</ul><p><a href="${xml(link)}">查看电量面板</a></p>`;
      return `<item><title>${xml(title)}</title><link>${xml(link)}</link><guid isPermaLink="false">urn:mooncci:electricity-report:${xml(report.id)}</guid><pubDate>${rssDate(report.publishedAt)}</pubDate><description>${xml(html)}</description></item>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>mooncci 宿舍电量</title><link>${xml(link)}</link><description>私密早晚电量报告；每天早晚更新，实际到达时间取决于阅读器刷新频率。</description><language>zh-cn</language>${items}</channel></rss>`;
}
module.exports = { buildReport, reportFields, renderElectricityRss, number };

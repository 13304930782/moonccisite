const { finiteNumber } = require('./electricityMetrics');
const { getBusinessDate, getShanghaiParts } = require('./electricityTime');

function shiftDate(date, days) {
  return new Date(
    Date.parse(`${date}T00:00:00+08:00`) + days * 86400000 + 8 * 3600000,
  )
    .toISOString()
    .slice(0, 10);
}
// A delayed job must never turn a daytime reading into an apparent midnight reading.
function isMidnightWindow(time) {
  const date = new Date(time);
  if (!Number.isFinite(date.getTime())) return false;
  const parts = getShanghaiParts(date);
  return parts.hour === 0 && parts.minute < 5;
}
function normalizeSchoolDays(rows, now) {
  const today = getBusinessDate(now),
    cutoff = shiftDate(today, -7),
    dates = new Map();
  for (const row of rows) {
    const date = String(row?.date || '');
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(`${date}T00:00:00+08:00`)) ||
      shiftDate(date, 0) !== date ||
      date < cutoff ||
      date >= today
    )
      continue;
    const usage = finiteNumber(row.use);
    const item = {
      usageDate: date,
      usage: usage !== null && usage >= 0 ? usage : null,
      status: usage !== null && usage >= 0 ? 'valid' : 'missing_value',
      method: 'school_daily',
      startAt: `${date}T00:00:00+08:00`,
      endAt: `${shiftDate(date, 1)}T00:00:00+08:00`,
      sourceStartAt:
        typeof row.firstcolldate === 'string'
          ? row.firstcolldate.slice(0, 32)
          : null,
      sourceEndAt:
        typeof row.lastcolldate === 'string'
          ? row.lastcolldate.slice(0, 32)
          : null,
    };
    // Conflicting duplicates are unknown, never silently picked or added together.
    if (dates.has(date) && dates.get(date).usage !== item.usage)
      dates.set(date, { ...item, usage: null, status: 'conflicting_data' });
    else if (dates.get(date)?.status !== 'conflicting_data')
      dates.set(date, item);
  }
  return [...dates.values()].sort((a, b) =>
    a.usageDate.localeCompare(b.usageDate),
  );
}
function completeDay(start, end, usageDate) {
  const base = {
    usageDate,
    startAt: start?.recordedAt || null,
    endAt: end?.recordedAt || null,
    meterId: end?.meterId || null,
    usage: null,
    status: 'missing_boundary',
    method: 'midnight_meter_delta',
  };
  if (!start || !end) return base;
  if (
    getBusinessDate(start.recordedAt) !== usageDate ||
    getBusinessDate(end.recordedAt) !== shiftDate(usageDate, 1)
  )
    return base;
  if (!isMidnightWindow(start.recordedAt) || !isMidnightWindow(end.recordedAt))
    return { ...base, status: 'late_boundary' };
  if (
    !start.scopeKey ||
    start.scopeKey !== end.scopeKey ||
    !start.meterId ||
    start.meterId !== end.meterId
  )
    return { ...base, status: 'meter_changed' };
  const from = finiteNumber(start.cumulativeReading),
    to = finiteNumber(end.cumulativeReading);
  if (from === null || to === null)
    return { ...base, status: 'missing_reading' };
  if (
    !start.cumulativeReadingSource ||
    start.cumulativeReadingSource !== end.cumulativeReadingSource
  )
    return { ...base, status: 'reading_source_changed' };
  if (to < from) return { ...base, status: 'reading_reset' };
  return {
    ...base,
    usage: Math.round((to - from) * 1e6) / 1e6,
    status: 'valid',
  };
}
function calculateMidnightForecast(
  dailyRows = [],
  boundary = null,
  now = new Date(),
) {
  const today = getBusinessDate(now),
    cutoff = shiftDate(today, -7),
    yesterday = shiftDate(today, -1);
  const valid = dailyRows.filter(
    (row) =>
      row.status === 'valid' &&
      boundary?.meterId &&
      row.meterId === boundary.meterId &&
      row.usageDate >= cutoff &&
      row.usageDate < today &&
      finiteNumber(row.usage) !== null &&
      row.usage >= 0,
  );
  const average = valid.length
    ? valid.reduce((sum, row) => sum + row.usage, 0) / valid.length
    : null;
  const latestDay = dailyRows.find((row) => row.usageDate === yesterday);
  const usableBoundary =
    boundary &&
    getBusinessDate(boundary.recordedAt) === today &&
    isMidnightWindow(boundary.recordedAt);
  const remaining = usableBoundary
    ? finiteNumber(boundary.totalRemaining)
    : null;
  return {
    method: 'midnight_daily_v1',
    averageDailyUse: average,
    usageSampleDays: valid.length,
    dailySource: '完整自然日用电（00:00 至次日 00:00）',
    estimatedDaysRemaining:
      remaining !== null && remaining >= 0 && valid.length >= 3 && average > 0
        ? remaining / average
        : null,
    forecastAt: usableBoundary ? boundary.recordedAt : null,
    forecastRemaining: remaining,
    completedDayDate: yesterday,
    completedDayUse:
      latestDay?.status === 'valid' && latestDay.meterId === boundary?.meterId
        ? latestDay.usage
        : null,
    completedDayStatus:
      latestDay && latestDay.meterId !== boundary?.meterId
        ? 'meter_changed'
        : latestDay?.status || 'missing_boundary',
    balanceChange: null,
    comparisonAt: null,
  };
}
const dailyStatusText = {
  conflicting_data: '学校日明细冲突',
  valid: '有效',
  missing_boundary: '缺少相邻零点采样',
  late_boundary: '零点采样超时',
  meter_changed: '宿舍或电表发生变化',
  missing_value: '学校日用量缺失',
  missing_reading: '累计读数缺失',
  reading_source_changed: '累计读数来源变化',
  reading_reset: '累计读数回退，可能发生换表或清零',
};
module.exports = {
  shiftDate,
  isMidnightWindow,
  normalizeSchoolDays,
  completeDay,
  calculateMidnightForecast,
  dailyStatusText,
};

const {
  getBusinessDate,
  getShanghaiParts,
  nextShanghaiHour,
} = require('./electricityTime');

const DEFAULT_SCHEDULE_HOURS = Object.freeze([0, 7, 12, 21]);
const DEFAULT_MANUAL_COOLDOWN_MINUTES = 15;

function defaultSchedule(value = process.env.ELECTRICITY_SCHEDULE_HOURS) {
  const hours = parseScheduleHours(value);
  return hours.map((hour) => ({
    hour,
    type:
      hour === 0 ? 'daily' : notificationSlotForHour(hour, hours) || 'collect',
  }));
}

function validateSchedule(rows) {
  const invalid = (message) => {
    throw Object.assign(new Error(message), {
      code: 'ELECTRICITY_INVALID_SCHEDULE',
    });
  };
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 24)
    invalid('运行计划需包含 1 至 24 个时间。');
  const hours = new Set();
  const reports = new Set();
  for (const row of rows) {
    if (
      !row ||
      !Number.isInteger(row.hour) ||
      row.hour < 0 ||
      row.hour > 23 ||
      !['daily', 'collect', 'morning', 'evening'].includes(row.type)
    )
      invalid('请选择有效的整点时间和任务。');
    if (hours.has(row.hour)) invalid('运行时间不能重复。');
    hours.add(row.hour);
    if ((row.hour === 0) !== (row.type === 'daily'))
      invalid('00:00 固定用于日统计，其他时间不能设置日统计。');
    if (['morning', 'evening'].includes(row.type)) {
      if (reports.has(row.type)) invalid('早报和晚报每天各最多一次。');
      reports.add(row.type);
    }
  }
  if (!hours.has(0)) invalid('必须保留 00:00 日统计。');
  const morning = rows.find((row) => row.type === 'morning');
  const evening = rows.find((row) => row.type === 'evening');
  if (morning && evening && morning.hour >= evening.hour)
    invalid('早报时间必须早于晚报。');
  return rows
    .map(({ hour, type }) => ({ hour, type }))
    .sort((a, b) => a.hour - b.hour);
}

function scheduleFromConfig(config = {}) {
  try {
    return validateSchedule(config.schedule);
  } catch {
    return defaultSchedule();
  }
}

function parseScheduleHours(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  const hours = [
    ...new Set(
      source
        .filter((hour) => String(hour).trim() !== '')
        .map(Number)
        .filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23),
    ),
  ].sort((left, right) => left - right);
  return hours.length
    ? [...new Set([0, ...hours])].sort((a, b) => a - b)
    : [...DEFAULT_SCHEDULE_HOURS];
}

function nextScheduleSlot(value = new Date(), hours = DEFAULT_SCHEDULE_HOURS) {
  return parseScheduleHours(hours)
    .map((hour) => ({ hour, at: nextShanghaiHour(value, hour) }))
    .sort((left, right) => left.at.getTime() - right.at.getTime())[0];
}

function latestPassedScheduleHour(
  value = new Date(),
  hours = DEFAULT_SCHEDULE_HOURS,
) {
  const currentHour = getShanghaiParts(value).hour;
  return (
    parseScheduleHours(hours)
      .filter((hour) => hour <= currentHour)
      .at(-1) ?? null
  );
}

function isSlotComplete(lastSuccessAt, value, slotHour) {
  if (!lastSuccessAt || slotHour === null || slotHour === undefined)
    return false;
  const success = new Date(lastSuccessAt);
  if (
    !Number.isFinite(success.getTime()) ||
    getBusinessDate(success) !== getBusinessDate(value)
  )
    return false;
  return getShanghaiParts(success).hour >= Number(slotHour);
}

function isPausedForBusinessDate(state = {}, value = new Date()) {
  if (!state.lastErrorAt) return false;
  const errorAt = new Date(state.lastErrorAt);
  if (
    !Number.isFinite(errorAt.getTime()) ||
    getBusinessDate(errorAt) !== getBusinessDate(value)
  )
    return false;
  const successAt = state.lastSuccessAt ? new Date(state.lastSuccessAt) : null;
  return (
    !successAt ||
    !Number.isFinite(successAt.getTime()) ||
    successAt.getTime() <= errorAt.getTime()
  );
}

function notificationSlotForHour(hour, hours = DEFAULT_SCHEDULE_HOURS) {
  const parsed = parseScheduleHours(hours).filter((value) => value !== 0);
  const value = Number(hour);
  if (value === 0) return null;
  if (parsed.length === 1 && value === parsed[0]) return 'evening';
  if (value === parsed[0]) return 'morning';
  if (value === parsed.at(-1)) return 'evening';
  return null;
}

function hasSentNotificationSlot(state = {}, snapshotDate, slot) {
  if (!slot || state.lastDailyEmailDate !== snapshotDate) return false;
  if (state.lastDailyEmailSlot === slot) return true;
  return !state.lastDailyEmailSlot && slot === 'evening';
}

function manualRefreshGuard(
  state = {},
  value = new Date(),
  cooldownMinutes = DEFAULT_MANUAL_COOLDOWN_MINUTES,
) {
  const now = value instanceof Date ? value : new Date(value);
  if (isPausedForBusinessDate(state, now)) {
    return {
      blocked: true,
      reason: 'paused_after_failure',
      retryAfterSeconds: null,
    };
  }
  if (!state.lastSuccessAt)
    return { blocked: false, reason: null, retryAfterSeconds: 0 };
  const successAt = new Date(state.lastSuccessAt);
  const cooldownMs =
    Math.max(1, Number(cooldownMinutes) || DEFAULT_MANUAL_COOLDOWN_MINUTES) *
    60 *
    1000;
  if (!Number.isFinite(successAt.getTime()))
    return { blocked: false, reason: null, retryAfterSeconds: 0 };
  const remainingMs =
    cooldownMs - Math.max(0, now.getTime() - successAt.getTime());
  if (remainingMs <= 0)
    return { blocked: false, reason: null, retryAfterSeconds: 0 };
  return {
    blocked: true,
    reason: 'cooldown',
    retryAfterSeconds: Math.ceil(remainingMs / 1000),
  };
}

module.exports = {
  defaultSchedule,
  validateSchedule,
  scheduleFromConfig,
  DEFAULT_MANUAL_COOLDOWN_MINUTES,
  DEFAULT_SCHEDULE_HOURS,
  hasSentNotificationSlot,
  isPausedForBusinessDate,
  isSlotComplete,
  latestPassedScheduleHour,
  manualRefreshGuard,
  nextScheduleSlot,
  notificationSlotForHour,
  parseScheduleHours,
};

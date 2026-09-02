const { getBusinessDate, getShanghaiParts, nextShanghaiHour } = require('./electricityTime');

const DEFAULT_SCHEDULE_HOURS = Object.freeze([7, 12, 21]);
const DEFAULT_MANUAL_COOLDOWN_MINUTES = 15;

function parseScheduleHours(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  const hours = [...new Set(source
    .filter((hour) => String(hour).trim() !== '')
    .map(Number)
    .filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23))]
    .sort((left, right) => left - right);
  return hours.length ? hours : [...DEFAULT_SCHEDULE_HOURS];
}

function nextScheduleSlot(value = new Date(), hours = DEFAULT_SCHEDULE_HOURS) {
  return parseScheduleHours(hours)
    .map((hour) => ({ hour, at: nextShanghaiHour(value, hour) }))
    .sort((left, right) => left.at.getTime() - right.at.getTime())[0];
}

function latestPassedScheduleHour(value = new Date(), hours = DEFAULT_SCHEDULE_HOURS) {
  const currentHour = getShanghaiParts(value).hour;
  return parseScheduleHours(hours).filter((hour) => hour <= currentHour).at(-1) ?? null;
}

function isSlotComplete(lastSuccessAt, value, slotHour) {
  if (!lastSuccessAt || slotHour === null || slotHour === undefined) return false;
  const success = new Date(lastSuccessAt);
  if (!Number.isFinite(success.getTime()) || getBusinessDate(success) !== getBusinessDate(value)) return false;
  return getShanghaiParts(success).hour >= Number(slotHour);
}

function isPausedForBusinessDate(state = {}, value = new Date()) {
  if (!state.lastErrorAt) return false;
  const errorAt = new Date(state.lastErrorAt);
  if (!Number.isFinite(errorAt.getTime()) || getBusinessDate(errorAt) !== getBusinessDate(value)) return false;
  const successAt = state.lastSuccessAt ? new Date(state.lastSuccessAt) : null;
  return !successAt || !Number.isFinite(successAt.getTime()) || successAt.getTime() <= errorAt.getTime();
}

function notificationSlotForHour(hour, hours = DEFAULT_SCHEDULE_HOURS) {
  const parsed = parseScheduleHours(hours);
  const value = Number(hour);
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

function manualRefreshGuard(state = {}, value = new Date(), cooldownMinutes = DEFAULT_MANUAL_COOLDOWN_MINUTES) {
  const now = value instanceof Date ? value : new Date(value);
  if (isPausedForBusinessDate(state, now)) {
    return { blocked: true, reason: 'paused_after_failure', retryAfterSeconds: null };
  }
  if (!state.lastSuccessAt) return { blocked: false, reason: null, retryAfterSeconds: 0 };
  const successAt = new Date(state.lastSuccessAt);
  const cooldownMs = Math.max(1, Number(cooldownMinutes) || DEFAULT_MANUAL_COOLDOWN_MINUTES) * 60 * 1000;
  if (!Number.isFinite(successAt.getTime())) return { blocked: false, reason: null, retryAfterSeconds: 0 };
  const remainingMs = cooldownMs - Math.max(0, now.getTime() - successAt.getTime());
  if (remainingMs <= 0) return { blocked: false, reason: null, retryAfterSeconds: 0 };
  return { blocked: true, reason: 'cooldown', retryAfterSeconds: Math.ceil(remainingMs / 1000) };
}

module.exports = {
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

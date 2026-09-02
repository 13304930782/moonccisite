const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hasSentNotificationSlot,
  isPausedForBusinessDate,
  isSlotComplete,
  latestPassedScheduleHour,
  manualRefreshGuard,
  nextScheduleSlot,
  notificationSlotForHour,
  parseScheduleHours,
} = require('../src/lib/electricitySchedule');

test('schedule defaults to three fixed Shanghai collection hours', () => {
  assert.deepEqual(parseScheduleHours(), [7, 12, 21]);
  assert.deepEqual(parseScheduleHours('21,7,12,7,bad'), [7, 12, 21]);
  assert.deepEqual(parseScheduleHours('bad, ,24,-1'), [7, 12, 21]);
  assert.equal(nextScheduleSlot(new Date('2026-09-01T03:59:00Z')).hour, 12);
  assert.equal(nextScheduleSlot(new Date('2026-09-01T13:01:00Z')).at.toISOString(), '2026-09-01T23:00:00.000Z');
});

test('startup catch-up identifies only the latest passed slot', () => {
  const now = new Date('2026-09-01T05:00:00Z');
  assert.equal(latestPassedScheduleHour(now), 12);
  assert.equal(isSlotComplete('2026-09-01T04:30:00Z', now, 12), true);
  assert.equal(isSlotComplete('2026-08-31T13:00:00Z', now, 12), false);
  assert.equal(notificationSlotForHour(7), 'morning');
  assert.equal(notificationSlotForHour(12), null);
  assert.equal(notificationSlotForHour(21), 'evening');
});

test('morning and evening reports are deduplicated independently', () => {
  const date = '2026-09-01';
  assert.equal(hasSentNotificationSlot({ lastDailyEmailDate: date, lastDailyEmailSlot: 'morning' }, date, 'morning'), true);
  assert.equal(hasSentNotificationSlot({ lastDailyEmailDate: date, lastDailyEmailSlot: 'morning' }, date, 'evening'), false);
  assert.equal(hasSentNotificationSlot({ lastDailyEmailDate: date, lastDailyEmailSlot: 'evening' }, date, 'evening'), true);
  assert.equal(hasSentNotificationSlot({ lastDailyEmailDate: date, lastDailyEmailSlot: null }, date, 'evening'), true);
  assert.equal(hasSentNotificationSlot({ lastDailyEmailDate: '2026-08-31', lastDailyEmailSlot: 'evening' }, date, 'evening'), false);
});

test('a collection failure pauses the remaining business day', () => {
  const now = new Date('2026-09-01T06:00:00Z');
  assert.equal(isPausedForBusinessDate({ lastErrorAt: '2026-09-01T04:01:00Z' }, now), true);
  assert.equal(isPausedForBusinessDate({ lastErrorAt: '2026-08-31T04:01:00Z' }, now), false);
  assert.equal(isPausedForBusinessDate({ lastErrorAt: '2026-09-01T04:01:00Z', lastSuccessAt: '2026-09-01T05:00:00Z' }, now), false);
});

test('manual refresh uses a cooldown and respects the daily circuit breaker', () => {
  const now = new Date('2026-09-01T06:00:00Z');
  assert.deepEqual(manualRefreshGuard({ lastSuccessAt: '2026-09-01T05:50:00Z' }, now, 15), {
    blocked: true, reason: 'cooldown', retryAfterSeconds: 300,
  });
  assert.equal(manualRefreshGuard({ lastSuccessAt: '2026-09-01T05:40:00Z' }, now, 15).blocked, false);
  assert.equal(manualRefreshGuard({ lastErrorAt: '2026-09-01T05:59:00Z' }, now, 15).reason, 'paused_after_failure');
});

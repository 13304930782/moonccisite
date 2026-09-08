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

test('schedule defaults to four fixed Shanghai collection hours', () => {
  assert.deepEqual(parseScheduleHours(), [0, 7, 12, 21]);
  assert.deepEqual(parseScheduleHours('21,7,12,7,bad'), [0, 7, 12, 21]);
  assert.deepEqual(parseScheduleHours('bad, ,24,-1'), [0, 7, 12, 21]);
  assert.equal(nextScheduleSlot(new Date('2026-09-01T03:59:00Z')).hour, 12);
  assert.equal(
    nextScheduleSlot(new Date('2026-09-01T13:01:00Z')).at.toISOString(),
    '2026-09-01T16:00:00.000Z',
  );
});

test('startup catch-up identifies only the latest passed slot', () => {
  const now = new Date('2026-09-01T05:00:00Z');
  assert.equal(latestPassedScheduleHour(now), 12);
  assert.equal(isSlotComplete('2026-09-01T04:30:00Z', now, 12), true);
  assert.equal(isSlotComplete('2026-08-31T13:00:00Z', now, 12), false);
  assert.equal(notificationSlotForHour(0), null);
  assert.equal(notificationSlotForHour(7), 'morning');
  assert.equal(notificationSlotForHour(12), null);
  assert.equal(notificationSlotForHour(21), 'evening');
});

test('morning and evening reports are deduplicated independently', () => {
  const date = '2026-09-01';
  assert.equal(
    hasSentNotificationSlot(
      { lastDailyEmailDate: date, lastDailyEmailSlot: 'morning' },
      date,
      'morning',
    ),
    true,
  );
  assert.equal(
    hasSentNotificationSlot(
      { lastDailyEmailDate: date, lastDailyEmailSlot: 'morning' },
      date,
      'evening',
    ),
    false,
  );
  assert.equal(
    hasSentNotificationSlot(
      { lastDailyEmailDate: date, lastDailyEmailSlot: 'evening' },
      date,
      'evening',
    ),
    true,
  );
  assert.equal(
    hasSentNotificationSlot(
      { lastDailyEmailDate: date, lastDailyEmailSlot: null },
      date,
      'evening',
    ),
    true,
  );
  assert.equal(
    hasSentNotificationSlot(
      { lastDailyEmailDate: '2026-08-31', lastDailyEmailSlot: 'evening' },
      date,
      'evening',
    ),
    false,
  );
});

test('a collection failure pauses the remaining business day', () => {
  const now = new Date('2026-09-01T06:00:00Z');
  assert.equal(
    isPausedForBusinessDate({ lastErrorAt: '2026-09-01T04:01:00Z' }, now),
    true,
  );
  assert.equal(
    isPausedForBusinessDate({ lastErrorAt: '2026-08-31T04:01:00Z' }, now),
    false,
  );
  assert.equal(
    isPausedForBusinessDate(
      {
        lastErrorAt: '2026-09-01T04:01:00Z',
        lastSuccessAt: '2026-09-01T05:00:00Z',
      },
      now,
    ),
    false,
  );
});

test('manual refresh uses a cooldown and respects the daily circuit breaker', () => {
  const now = new Date('2026-09-01T06:00:00Z');
  assert.deepEqual(
    manualRefreshGuard({ lastSuccessAt: '2026-09-01T05:50:00Z' }, now, 15),
    {
      blocked: true,
      reason: 'cooldown',
      retryAfterSeconds: 300,
    },
  );
  assert.equal(
    manualRefreshGuard({ lastSuccessAt: '2026-09-01T05:40:00Z' }, now, 15)
      .blocked,
    false,
  );
  assert.equal(
    manualRefreshGuard({ lastErrorAt: '2026-09-01T05:59:00Z' }, now, 15).reason,
    'paused_after_failure',
  );
});

test('editable schedules keep midnight, explicit report roles and reject ambiguous or invalid plans', () => {
  const {
    defaultSchedule,
    validateSchedule,
    scheduleFromConfig,
  } = require('../src/lib/electricitySchedule');
  const midnight = { hour: 0, type: 'daily' };
  assert.deepEqual(defaultSchedule('7,12,21'), [
    midnight,
    { hour: 7, type: 'morning' },
    { hour: 12, type: 'collect' },
    { hour: 21, type: 'evening' },
  ]);
  assert.deepEqual(defaultSchedule('6,18'), [
    midnight,
    { hour: 6, type: 'morning' },
    { hour: 18, type: 'evening' },
  ]);
  const custom = [
    midnight,
    { hour: 7, type: 'morning' },
    { hour: 21, type: 'evening' },
    { hour: 22, type: 'collect' },
  ];
  assert.deepEqual(validateSchedule([...custom].reverse()), custom);
  assert.deepEqual(scheduleFromConfig({ schedule: custom }), custom);
  for (const invalid of [
    [],
    null,
    [{ hour: 7, type: 'morning' }],
    [midnight, midnight],
    [midnight, { hour: 1, type: 'daily' }],
    [midnight, { hour: 1.5, type: 'collect' }],
    [midnight, { hour: 24, type: 'collect' }],
    [midnight, { hour: 7, type: 'bad' }],
    [midnight, { hour: 7, type: 'morning' }, { hour: 8, type: 'morning' }],
    [midnight, { hour: 21, type: 'morning' }, { hour: 7, type: 'evening' }],
  ]) {
    assert.throws(() => validateSchedule(invalid), {
      code: 'ELECTRICITY_INVALID_SCHEDULE',
    });
  }
  assert.deepEqual(validateSchedule([midnight]), [midnight]);
});

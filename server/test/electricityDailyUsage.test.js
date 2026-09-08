const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeSchoolDays,
  completeDay,
  calculateMidnightForecast,
  isMidnightWindow,
} = require('../src/lib/electricityDailyUsage');
const {
  fetchElectricityDailyUsage,
  readCumulativeReading,
} = require('../src/lib/electricity');
const now = new Date('2026-09-07T00:00:00+08:00');
const boundary = {
  scopeKey: 'scope',
  meterId: 'meter',
  snapshotDate: '2026-09-07',
  recordedAt: now.toISOString(),
  totalRemaining: 40,
  cumulativeReading: 108,
  cumulativeReadingSource: 'record.reading',
};

test('school daily rows retain zero, reject incomplete/future/invalid dates and conflicting duplicates', () => {
  const rows = normalizeSchoolDays(
    [
      { date: '2026-09-06', use: '0' },
      { date: '2026-09-05', use: null },
      { date: '2026-09-04', use: 5 },
      { date: '2026-09-04', use: 6 },
      { date: '2026-09-07', use: 1 },
      { date: '2026-09-08', use: 999 },
      { date: '09-03', use: 9 },
      { date: '2026-02-30', use: 2 },
    ],
    now,
  );
  assert.equal(rows.length, 3);
  assert.equal(rows.find((r) => r.usageDate === '2026-09-06').usage, 0);
  assert.equal(
    rows.find((r) => r.usageDate === '2026-09-05').status,
    'missing_value',
  );
  assert.equal(
    rows.find((r) => r.usageDate === '2026-09-04').status,
    'conflicting_data',
  );
});
test('daily history uses verified school command and dates, never the weekly sum', async () => {
  let payload;
  const rows = await fetchElectricityDailyUsage({
    now,
    env: {
      ELECTRICITY_SCHOOL_ACCOUNT: 'test',
      ELECTRICITY_ROOM_VERIFY: 'private',
    },
    fetchImpl: async (url) => {
      payload = JSON.parse(new URL(url).searchParams.get('param'));
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            code_: 0,
            result_: true,
            body: JSON.stringify({
              result: 0,
              sumuse: 9999,
              dayuselist: [{ date: '2026-09-06', use: '8.24' }],
            }),
          }),
      };
    },
  });
  assert.equal(payload.cmd, 'gettimeusedetail');
  assert.equal(payload.businesstype, 0);
  assert.equal(payload.startdate, '2026-08-31');
  assert.equal(payload.enddate, '2026-09-06');
  assert.equal(rows[0].usage, 8.24);
  assert.equal(rows[0].method, 'school_daily');
});
test('forecast uses completed days and midnight balance, excluding another meter and the current day', () => {
  const days = [0, 6, 6].map((usage, i) => ({
    usageDate: `2026-09-0${4 + i}`,
    usage,
    status: 'valid',
    meterId: 'meter',
    method: 'school_daily',
  }));
  days.push(
    { usageDate: '2026-09-07', usage: 0.1, status: 'valid', meterId: 'meter' },
    { usageDate: '2026-09-03', usage: 900, status: 'valid', meterId: 'other' },
  );
  const metrics = calculateMidnightForecast(days, boundary, now);
  assert.equal(metrics.averageDailyUse, 4);
  assert.equal(metrics.estimatedDaysRemaining, 10);
  assert.equal(metrics.completedDayUse, 6);
  assert.deepEqual(
    calculateMidnightForecast(
      days,
      boundary,
      new Date('2026-09-07T21:00:00+08:00'),
    ),
    metrics,
  );
  assert.equal(
    calculateMidnightForecast(days, null, now).estimatedDaysRemaining,
    null,
  );
  assert.equal(
    calculateMidnightForecast(days.slice(0, 2), boundary, now)
      .estimatedDaysRemaining,
    null,
  );
  assert.equal(
    calculateMidnightForecast(
      days,
      boundary,
      new Date('2026-09-08T07:00:00+08:00'),
    ).estimatedDaysRemaining,
    null,
  );
});
test('cumulative readings are real nullable fields, midnight differences survive recharge but reject reset/gaps', () => {
  assert.equal(
    readCumulativeReading({ todayuse: 8, odd: 40 }, { sumuse: 53 })
      .cumulativeReading,
    null,
  );
  assert.equal(
    readCumulativeReading({ reading: '108.123456' }, {}, 'record.reading')
      .cumulativeReading,
    108.123456,
  );
  assert.equal(
    readCumulativeReading({ reading: '' }, {}, 'record.reading')
      .cumulativeReading,
    null,
  );
  const start = {
    ...boundary,
    snapshotDate: '2026-09-06',
    recordedAt: '2026-09-06T00:00:00+08:00',
    cumulativeReading: 100,
    totalRemaining: 10,
  };
  assert.equal(completeDay(start, boundary, '2026-09-06').usage, 8);
  assert.equal(
    completeDay({ ...start, cumulativeReading: 110 }, boundary, '2026-09-06')
      .status,
    'reading_reset',
  );
  assert.equal(
    completeDay(
      { ...start, cumulativeReading: null },
      { ...boundary, cumulativeReading: null },
      '2026-09-06',
    ).usage,
    null,
  );
  assert.equal(
    completeDay({ ...start, meterId: 'old' }, boundary, '2026-09-06').status,
    'meter_changed',
  );
  assert.equal(
    completeDay(
      { ...start, recordedAt: '2026-09-06T07:00:00+08:00' },
      boundary,
      '2026-09-06',
    ).status,
    'late_boundary',
  );
  assert.equal(isMidnightWindow('2026-09-07T00:04:59+08:00'), true);
  assert.equal(isMidnightWindow('2026-09-07T00:05:00+08:00'), false);
});

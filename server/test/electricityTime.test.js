const test = require('node:test');
const assert = require('node:assert/strict');
const { getBusinessDate, hasReachedShanghaiHour, nextShanghaiHour } = require('../src/lib/electricityTime');

test('business date is calculated in Asia/Shanghai across UTC midnight', () => {
  assert.equal(getBusinessDate(new Date('2026-08-31T16:01:00Z')), '2026-09-01');
  assert.equal(getBusinessDate(new Date('2026-09-01T15:59:00Z')), '2026-09-01');
});

test('daily job hour uses Asia/Shanghai and advances to the next day', () => {
  assert.equal(hasReachedShanghaiHour(new Date('2026-09-01T13:01:00Z'), 21), true);
  assert.equal(nextShanghaiHour(new Date('2026-09-01T13:01:00Z'), 21).toISOString(), '2026-09-02T13:00:00.000Z');
});

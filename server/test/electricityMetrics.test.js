const test = require('node:test');
const assert = require('node:assert/strict');
const { finiteNumber, classifyElectricity, calculateUsageStats, evaluateLowAlertTransition } = require('../src/lib/electricityMetrics');

test('finiteNumber accepts numeric strings but rejects invalid values', () => {
  assert.equal(finiteNumber('1,234.5'), 1234.5);
  assert.equal(finiteNumber('not-a-number'), null);
  assert.equal(finiteNumber(''), null);
});

test('remaining-days estimate requires at least three positive samples', () => {
  const two = calculateUsageStats([{ snapshotDate: '2026-08-30', todayUse: 2 }, { snapshotDate: '2026-08-31', todayUse: 4 }], { totalRemaining: 30 });
  assert.equal(two.estimatedDaysRemaining, null);
  const three = calculateUsageStats([...Array(3)].map((_, index) => ({ snapshotDate: `2026-08-${29 + index}`, todayUse: 2 })), { totalRemaining: 30 });
  assert.equal(three.estimatedDaysRemaining, 15);
});

test('balance change compares current with previous snapshot', () => {
  const stats = calculateUsageStats([
    { snapshotDate: '2026-08-31', totalRemaining: 30, todayUse: 2 },
    { snapshotDate: '2026-09-01', totalRemaining: 27, todayUse: 3 },
  ], { totalRemaining: 27 });
  assert.equal(stats.balanceChange, -3);
});

test('threshold classifier distinguishes normal, low and critical', () => {
  const config = { lowPurchaseThreshold: 10, lowTotalThreshold: 20 };
  assert.equal(classifyElectricity({ purchasedRemaining: 15, totalRemaining: 40 }, config), 'normal');
  assert.equal(classifyElectricity({ purchasedRemaining: 8, totalRemaining: 30 }, config), 'low');
  assert.equal(classifyElectricity({ purchasedRemaining: 8, totalRemaining: 18 }, config), 'critical');
  assert.equal(classifyElectricity({ purchasedRemaining: 10, totalRemaining: 20 }, config), 'normal');
});

test('low-alert transition sends once and records recovery', () => {
  assert.deepEqual(evaluateLowAlertTransition(false, 'low'), { isLow: true, entered: true, recovered: false });
  assert.deepEqual(evaluateLowAlertTransition(true, 'critical'), { isLow: true, entered: false, recovered: false });
  assert.deepEqual(evaluateLowAlertTransition(true, 'normal'), { isLow: false, entered: false, recovered: true });
});

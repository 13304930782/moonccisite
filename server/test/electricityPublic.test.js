const test = require('node:test');
const assert = require('node:assert/strict');
const { publicSnapshot } = require('../src/services/electricityMonitor');

test('public snapshot strictly excludes school credentials and meter identity', () => {
  const output = publicSnapshot({
    snapshotDate: '2026-09-01', recordedAt: '2026-09-01T13:00:00.000Z', todayUse: 5.04,
    purchasedRemaining: 22.06, subsidyRemaining: 29.84, totalRemaining: 51.9, price: 0.5,
    roomVerify: 'never-public', account: 'never-public', meterId: 'private-meter', roomName: 'private-room',
  });
  assert.deepEqual(Object.keys(output).sort(), ['price', 'purchasedRemaining', 'recordedAt', 'snapshotDate', 'subsidyRemaining', 'todayUse', 'totalRemaining'].sort());
  assert.doesNotMatch(JSON.stringify(output), /never-public|private-meter|private-room/);
});

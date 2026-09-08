const test = require('node:test');
const assert = require('node:assert/strict');
const repository = require('../src/repositories/electricityRepository');
const { collectSnapshot } = require('../src/services/electricityMonitor');

test('collectSnapshot forwards a valid millisecond timestamp through the real fetch request builder', async (t) => {
  const timestamp = Date.parse('2026-09-01T13:00:00.000Z');
  const env = {
    ELECTRICITY_SCHOOL_ACCOUNT: 'test-account',
    ELECTRICITY_ROOM_VERIFY: 'test-room-token',
  };
  let requestPayload;

  t.mock.method(repository, 'upsertSnapshot', async (snapshot, snapshotDate, recordedAt) => {
    assert.equal(snapshotDate, '2026-09-01');
    assert.ok(recordedAt instanceof Date);
    assert.equal(recordedAt.getTime(), timestamp);
    return { ...snapshot, snapshotDate, recordedAt: recordedAt.toISOString() };
  });
  t.mock.method(repository, 'markCollectionSuccess', async (recordedAt) => {
    assert.equal(recordedAt.getTime(), timestamp);
  });
  t.mock.method(repository, 'markCollectionFailure', async () => {
    assert.fail('successful collection must not be marked as failed');
  });

  const result = await collectSnapshot({
    env,
    now: timestamp,
    fetchImpl: async (url) => {
      requestPayload = JSON.parse(new URL(url).searchParams.get('param'));
      return {
        ok: true,
        headers: { get: () => null },
        text: async () => JSON.stringify({
          code_: 0,
          result_: 'true',
          body: JSON.stringify({
            result: '0',
            roomfullname: 'A-101',
            modlist: [{ odd: '51.9', sumbuy: '22.06', sumsub: '29.84', todayuse: '5.04', price: '0.5' }],
          }),
        }),
      };
    },
  });

  assert.equal(typeof requestPayload.timestamp, 'number');
  assert.equal(Number.isFinite(requestPayload.timestamp), true);
  assert.equal(requestPayload.timestamp, timestamp);
  assert.equal(result.totalRemaining, 51.9);
});

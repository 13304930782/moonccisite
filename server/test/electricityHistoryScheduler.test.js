const test = require('node:test');
const assert = require('node:assert/strict');
const { dueEntry } = require('../src/jobs/electricityScheduler');
const plan = {
  active: 1,
  updated_at: new Date('2026-09-08T00:00:00+08:00'),
  config: {
    enabled: true,
    schedule: [
      { hour: 0, type: 'daily' },
      { hour: 7, type: 'morning' },
      { hour: 12, type: 'collect' },
      { hour: 21, type: 'evening' },
      { hour: 22, type: 'collect' },
    ],
  },
};
test('room plans respect midnight window, explicit roles and start after edits', () => {
  assert.equal(
    dueEntry(plan, new Date('2026-09-09T00:01:00+08:00')).type,
    'daily',
  );
  assert.equal(dueEntry(plan, new Date('2026-09-09T06:59:00+08:00')), null);
  assert.equal(
    dueEntry(plan, new Date('2026-09-09T07:00:00+08:00')).type,
    'morning',
  );
  assert.equal(
    dueEntry(plan, new Date('2026-09-09T12:00:00+08:00')).type,
    'collect',
  );
  assert.equal(
    dueEntry(plan, new Date('2026-09-09T21:00:00+08:00')).type,
    'evening',
  );
  assert.equal(
    dueEntry(plan, new Date('2026-09-09T22:00:00+08:00')).type,
    'collect',
  );
  assert.equal(
    dueEntry(
      { ...plan, updated_at: new Date('2026-09-09T07:30:00+08:00') },
      new Date('2026-09-09T08:00:00+08:00'),
    ),
    null,
  );
  assert.equal(
    dueEntry({ ...plan, active: 0 }, new Date('2026-09-09T07:00:00+08:00')),
    null,
  );
  assert.equal(
    dueEntry(
      { ...plan, config: { ...plan.config, enabled: false } },
      new Date('2026-09-09T07:00:00+08:00'),
    ),
    null,
  );
});

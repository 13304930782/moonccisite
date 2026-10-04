const test = require('node:test');
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const { MailboxPoolManager } = require('../src/lib/mailboxPoolManager');
const policy = require('../src/lib/mailboxPoolPolicy');
const account = id => ({ user_id: id, mailbox_address: `${id}@example.invalid`, smtp_secret: `sealed-${id}` });
const gate = () => { let resolve; return { promise: new Promise(r => { resolve = r; }), resolve }; };
function fixture(t, options = {}) {
  const resources = [], events = [];
  const pool = new MailboxPoolManager({ protocol: 'imap', limit: 2, observe: e => events.push(e), create: a => {
    const resource = { user: a.user_id, closed: false, shutdown() { this.closed = true; } };
    resources.push(resource); return resource;
  }, ...options });
  t.after(() => pool.shutdown()); return { pool, resources, events };
}
test('A/B warm reuse, independent concurrency, same-account serialization; no identity in metrics', async t => {
  const { pool, resources, events } = fixture(t), a = account(1), b = account(2), hold = gate();
  let a2 = false, b1 = false;
  const first = pool.run(a, async r => { assert.equal(r.user, 1); await hold.promise; });
  const second = pool.run(a, r => { a2 = true; assert.equal(r.user, 1); });
  await pool.run(b, r => { b1 = true; assert.equal(r.user, 2); });
  assert(b1); assert(!a2); hold.resolve(); await Promise.all([first, second]);
  await pool.run(b, r => assert.equal(r, resources[1])); assert.equal(resources.length, 2);
  assert(!/sealed-|example.invalid|user_id|mailbox_address/.test(JSON.stringify(events)));
});
test('real LRU eviction, busy protection, global budget and fallback admission', async t => {
  const { pool, resources } = fixture(t); const a = account(1), b = account(2), c = account(3);
  await pool.run(a, () => {}); await delay(2); await pool.run(b, () => {}); await pool.run(a, () => {});
  await pool.run(c, () => {}); assert.equal(resources[1].closed, true); assert.equal(resources[0].closed, false);
  const one = gate(), two = gate(); const pa = pool.run(a, () => one.promise), pc = pool.run(c, () => two.promise);
  let admitted = false; const fallback = pool.run(b, () => { admitted = true; }, { retain: false });
  assert.equal(pool.snapshot().active, 2); assert.equal(pool.snapshot().waiting, 1); assert(!admitted);
  one.resolve(); await pa; await fallback; assert(admitted); assert.equal(pool.snapshot().fallback, 1);
  assert(resources.at(-1).closed); assert.equal(pool.snapshot().active, 1); two.resolve(); await pc;
});
test('credential/address change and revocation affect only A; old queued credentials never execute', async t => {
  const { pool, resources } = fixture(t); const a = account(1), b = account(2);
  await pool.run(a, () => {}); await pool.run(b, () => {});
  await pool.run({ ...a, smtp_secret: 'rotated' }, () => {});
  assert(resources[0].closed); assert(!resources[1].closed);
  pool.invalidate(1); assert(resources[2].closed); assert(!resources[1].closed);
  const hold = gate(); const busy = pool.run(a, () => hold.promise);
  let called = false; const waiting = assert.rejects(pool.run(a, () => { called = true; }), { code: 'MAIL_POOL_INVALIDATED' });
  pool.invalidate(1); await waiting; assert(!called); hold.resolve(); await busy;
  await pool.run({ ...a, mailbox_address: 'changed@example.invalid' }, () => {});
  assert.equal(pool.entries.size, 2);
});
test('bounded queues and wait expiry never release a busy reservation or replay', async t => {
  const { pool } = fixture(t, { limit: 1, waitMs: 25, perAccountWaiting: 1, maxWaiting: 2 });
  const hold = gate(), a = account(1); const busy = pool.run(a, () => hold.promise);
  let invoked = 0; const queued = assert.rejects(pool.run(a, () => { invoked++; }), { code: 'MAIL_POOL_WAIT_TIMEOUT' });
  await assert.rejects(pool.run(a, () => {}), { code: 'MAIL_POOL_BUSY' });
  await queued; assert.equal(invoked, 0); assert.equal(pool.snapshot().active, 1);
  hold.resolve(); await busy; assert.equal(pool.snapshot().waiting, 0);
});
test('idle expiry, broken resource cleanup and shutdown cancel queued admissions', async t => {
  const { pool, resources } = fixture(t, { idleMs: 20, limit: 1 });
  await pool.run(account(1), () => {}); await delay(30); assert.equal(pool.entries.size, 0); assert(resources[0].closed);
  await assert.rejects(pool.run(account(1), () => { throw Error('broken'); })); assert(resources[1].closed);
  await pool.run(account(1), () => {}); assert.equal(resources.length, 3);
  const hold = gate(); const busy = pool.run(account(1), () => hold.promise);
  const queued = assert.rejects(pool.run(account(2), () => assert.fail('must not run')), { code: 'MAIL_POOL_STOPPING' });
  pool.shutdown(); await queued; assert(resources[2].closed);
  await assert.rejects(pool.run(account(3), () => {})); hold.resolve(); await busy;
  assert.equal(pool.entries.size, 0);
});
test('stable rollout, eligibility, independent killswitches and fail-closed worker gate', () => {
  const env = { MAILBOX_IMAP_POOL_ENABLED: 'true', MAILBOX_SMTP_POOL_ENABLED: 'true', MAILBOX_IMAP_POOL_API_PROCESSES: '1', MAILBOX_SMTP_POOL_API_PROCESSES: '1', MAILBOX_POOL_ROLLOUT_PERCENT: '25' };
  const selected = Array.from({ length: 1000 }, (_, i) => policy.poolingEnabled(account(i + 1), 'IMAP', env));
  assert(selected.filter(Boolean).length > 150 && selected.filter(Boolean).length < 350);
  assert.deepEqual(selected, Array.from({ length: 1000 }, (_, i) => policy.poolingEnabled(account(i + 1), 'SMTP', env)));
  env.MAILBOX_POOL_ROLLOUT_PERCENT = '100'; assert(policy.poolingEnabled(account(1), 'IMAP', env));
  assert(!policy.poolingEnabled({ ...account(1), change_status: 'pending' }, 'IMAP', env));
  env.MAILBOX_IMAP_POOL_ENABLED = 'false'; assert(!policy.poolingEnabled(account(1), 'IMAP', env)); assert(policy.poolingEnabled(account(1), 'SMTP', env));
  env.MAILBOX_POOLS_ENABLED = 'false'; assert(!policy.poolingEnabled(account(1), 'SMTP', env));
  env.MAILBOX_POOLS_ENABLED = 'true'; env.NODE_APP_INSTANCE = '1'; assert(!policy.poolingEnabled(account(1), 'SMTP', env));
  assert.equal(policy.budget('IMAP', { MAILBOX_IMAP_POOL_GLOBAL_MAX: 'Infinity' }), 6);
  assert.equal(policy.budget('SMTP', { MAILBOX_SMTP_POOL_GLOBAL_MAX: '999' }), 4);
});

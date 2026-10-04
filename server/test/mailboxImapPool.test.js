const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');
const { MailboxImapPool } = require('../src/lib/mailboxImapPool');
const { createTiming } = require('../src/lib/mailboxTiming');
const { installMailboxShutdown } = require('../src/lib/mailboxShutdown');
const account = (id = 1, secret = 'encrypted-one') => ({ user_id: id, mailbox_address: `user${id}@example.invalid`,
  smtp_secret: secret, imap_host: 'mail.example.invalid', imap_port: 993 });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function setup(t, options = {}) {
  const clients = [];
  const pool = new MailboxImapPool({ createClient: a => {
    const c = new EventEmitter();
    c.accountId = a.user_id; c.usable = false; c.closed = 0; c.noops = 0;
    c.connect = async () => { c.usable = true; };
    c.noop = async () => { c.noops++; if (c.broken) throw Error('closed'); };
    c.close = () => { c.usable = false; c.closed++; c.emit('close'); };
    clients.push(c); return c;
  }, ...options });
  t.after(() => pool.shutdown());
  return { pool, clients };
}

test('same account reuses exactly one connection and probes NOOP', async t => {
  const { pool, clients } = setup(t);
  const first = await pool.run(account(), async c => c);
  const timing = createTiming('list');
  assert.equal(await pool.run(account(), async c => c, timing), first);
  assert.equal(clients.length, 1); assert.equal(first.noops, 1);
  assert.equal(timing.snapshot().connection_reused, true);
});

test('different users and mailboxes never share a connection', async t => {
  const { pool, clients } = setup(t, { maxConnections: 2 });
  assert.notEqual(await pool.run(account(1), async c => c), await pool.run(account(2), async c => c));
  assert.equal(clients.length, 2);
  assert.ok([...pool.entries.keys()].every(key => /^[a-f0-9]{64}$/.test(key)));
  assert.ok(!JSON.stringify([...pool.entries].map(([key, entry]) => ({ key, version: entry.version }))).includes('encrypted-one'));
});

test('concurrent requests serialize the complete operation', async t => {
  const { pool, clients } = setup(t);
  const gate = deferred(), started = deferred(), order = [];
  const first = pool.run(account(), async () => { order.push(1); started.resolve(); await gate.promise; order.push(2); });
  await started.promise;
  const second = pool.run(account(), async () => { order.push(3); });
  await delay(5); assert.deepEqual(order, [1]); gate.resolve();
  await Promise.all([first, second]); assert.deepEqual(order, [1, 2, 3]); assert.equal(clients.length, 1);
});

test('broken or closed connection reconnects before work, never retries work', async t => {
  const { pool, clients } = setup(t);
  await pool.run(account(), async () => {}); clients[0].broken = true;
  const timing = createTiming('read');
  await pool.run(account(), async () => {}, timing);
  assert.equal(clients.length, 2); assert.equal(clients[0].closed, 1);
  assert.equal(timing.snapshot().reconnect_count, 1);
  let calls = 0;
  await assert.rejects(pool.run(account(), async () => { calls++; throw Error('APPEND acknowledgement lost'); }));
  assert.equal(calls, 1); assert.equal(clients[1].closed, 1);
});

test('idle expiry closes the retained socket and next operation is cold', async t => {
  const { pool, clients } = setup(t, { idleMs: 10 });
  await pool.run(account(), async () => {}); await delay(25);
  assert.equal(clients[0].closed, 1); assert.equal(pool.entries.size, 0);
  await pool.run(account(), async () => {}); assert.equal(clients.length, 2);
});

test('credential version change invalidates old connection', async t => {
  const { pool, clients } = setup(t);
  await pool.run(account(), async () => {});
  await pool.run(account(1, 'encrypted-two'), async () => {});
  assert.equal(clients.length, 2); assert.equal(clients[0].closed, 1);
});

test('revoke/disconnect invalidation closes immediately and cancels queued snapshots', async t => {
  const { pool, clients } = setup(t);
  const gate = deferred(), started = deferred();
  const first = pool.run(account(), async () => { started.resolve(); await gate.promise; });
  await started.promise;
  let queuedRan = false;
  const queued = pool.run(account(), async () => { queuedRan = true; });
  const checks = [assert.rejects(first, { code: 'IMAP_ACCOUNT_CHANGED' }), assert.rejects(queued, { code: 'IMAP_ACCOUNT_CHANGED' })];
  pool.invalidate(1); assert.equal(clients[0].closed, 1); gate.resolve(); await Promise.all(checks);
  assert.equal(queuedRan, false);
});

test('authorization is revalidated after queueing; changed access fails closed', async t => {
  let authorized = true;
  const { pool, clients } = setup(t, { validate: async () => authorized });
  await pool.run(account(), async () => {}); authorized = false;
  await assert.rejects(pool.run(account(), async () => assert.fail('must not run')), { code: 'IMAP_ACCOUNT_CHANGED' });
  assert.equal(clients[0].closed, 1);
});

test('pool limit never falls back to an extra connection while busy', async t => {
  const { pool, clients } = setup(t);
  const gate = deferred(), started = deferred();
  const first = pool.run(account(), async () => { started.resolve(); await gate.promise; }); await started.promise;
  await assert.rejects(pool.run(account(2), async () => {}), { code: 'IMAP_POOL_LIMIT' });
  assert.equal(clients.length, 1); gate.resolve(); await first;
  await pool.run(account(2), async () => {}); assert.equal(clients[0].closed, 1);
});

test('a timed out waiter cannot release the serialization lane early', async t => {
  const { pool } = setup(t, { waitMs: 10 });
  const gate = deferred(), started = deferred();
  const first = pool.run(account(), async () => { started.resolve(); await gate.promise; }); await started.promise;
  await assert.rejects(pool.run(account(), async () => assert.fail('timed out task ran')), { code: 'IMAP_POOL_WAIT_TIMEOUT' });
  const third = pool.run(account(), async () => assert.fail('third bypassed first'));
  await assert.rejects(third, { code: 'IMAP_POOL_WAIT_TIMEOUT' }); gate.resolve(); await first;
  await pool.run(account(), async () => {});
});

test('SIGTERM and SIGINT cleanup stops admission and closes clients before HTTP drain', async t => {
  const { pool, clients } = setup(t);
  await pool.run(account(), async () => {});
  const signals = new EventEmitter(), exits = [];
  installMailboxShutdown({ close: callback => { assert.equal(clients[0].closed, 1); callback(); } },
    () => pool.shutdown(), { signals, exit: code => exits.push(code) });
  signals.emit('SIGTERM'); signals.emit('SIGINT');
  await assert.rejects(pool.run(account(), async () => {}), { code: 'IMAP_POOL_STOPPING' });
  assert.deepEqual(exits, [0]); assert.equal(pool.entries.size, 0);
});

test('telemetry records failures and rejects secret/body/header fields; logger failure is harmless', async () => {
  const rows = []; let clock = 0;
  const timing = createTiming('send', { now: () => clock, env: { MAILBOX_TIMING_ENABLED: 'true', MAILBOX_TIMING_SAMPLE_RATE: '1' }, emit: x => rows.push(x) });
  await assert.rejects(timing.measure('smtp_submit_ms', async () => { clock = 12; throw Error('PASSWORD BODY AUTH'); }));
  timing.add('smtp_secret', 'PASSWORD'); timing.add('headers', 123); timing.add('fetch_ms', NaN);
  timing.finish(502); timing.finish(502);
  assert.equal(rows.length, 1); const row = JSON.parse(rows[0]);
  assert.equal(row.smtp_submit_ms, 12); assert.equal(row.total_ms, 12);
  assert.ok(!/PASSWORD|BODY|AUTH|smtp_secret|headers/.test(rows[0]));
  createTiming('read', { env: { MAILBOX_TIMING_ENABLED: 'true' }, emit: () => { throw Error('logger unavailable'); } }).finish(502);
});

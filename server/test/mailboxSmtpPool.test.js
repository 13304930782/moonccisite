const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tls = require('node:tls');
const { execFileSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const nodemailer = require('nodemailer');
const { MailboxSmtpPool } = require('../src/lib/mailboxSmtpPool');
const { createTiming } = require('../src/lib/mailboxTiming');
let key, cert, directory;
test.before(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mooncci-smtp-tls-'));
  const openssl = process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl';
  execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(directory,'key.pem'),
    '-out', path.join(directory,'cert.pem'), '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'], { stdio: 'ignore' });
  key = fs.readFileSync(path.join(directory,'key.pem')); cert = fs.readFileSync(path.join(directory,'cert.pem'));
});
test.after(() => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); });

async function setup(t, options = {}) {
  const state = { connections: 0, accepted: 0, auth: 0, mode: 'ok', sockets: new Set(), pendingReplies: [], crossed: 0, users: [] };
  const server = tls.createServer({ key, cert }, socket => {
    state.connections++; state.sockets.add(socket);
    socket.on('error', () => {}); socket.on('close', () => state.sockets.delete(socket));
    socket.write('220 fixture ESMTP\r\n');
    let buffer = '', data = false, authenticated;
    socket.on('data', chunk => {
      buffer += chunk.toString();
      while (buffer.includes('\r\n')) {
        const offset = buffer.indexOf('\r\n'), line = buffer.slice(0, offset); buffer = buffer.slice(offset + 2);
        if (data) {
          if (line !== '.') continue; // discard body/header/AUTH entirely
          data = false; state.accepted++;
          if (state.mode === 'lost250') socket.destroy();
          else if (state.mode === 'hold') state.pendingReplies.push(() => socket.write('250 queued\r\n'));
          else socket.write('250 queued\r\n');
        } else if (line.startsWith('EHLO')) socket.write('250-fixture\r\n250 AUTH PLAIN\r\n');
        else if (line.startsWith('AUTH')) { state.auth++; authenticated = Buffer.from(line.split(' ')[2], 'base64').toString().split('\0')[1]; state.users.push(authenticated); socket.write('235 authenticated\r\n'); }
        else if (line.startsWith('MAIL') && !line.toLowerCase().includes(`<${authenticated?.toLowerCase()}>`)) { state.crossed++; socket.write('550 wrong account\r\n'); }
        else if (line.startsWith('MAIL') || line.startsWith('RCPT') || line === 'RSET') socket.write('250 OK\r\n');
        else if (line === 'DATA') { data = true; socket.write('354 continue\r\n'); }
        else if (line === 'QUIT') socket.end('221 bye\r\n');
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const configurations = [];
  const createLane = () => new MailboxSmtpPool({ createTransport: config => { configurations.push(config); return nodemailer.createTransport(config); },
    password: () => 'FixtureOnly42!', validate: async () => true,
    connect: opts => tls.connect({ ...opts, host: '127.0.0.1', ca: cert }),
    ...options });
  const pool = createLane();
  const account = { user_id: 1, mailbox_address: 'owner@example.invalid', smtp_secret: 'sealed-fixture', smtp_host: 'localhost', smtp_port: server.address().port };
  const mail = { envelope: { from: account.mailbox_address, to: ['local@example.invalid'] }, raw: 'Subject: fixture\r\n\r\nlocal test\r\n' };
  t.after(async () => { pool.shutdown(); for (const socket of state.sockets) socket.destroy(); await new Promise(r => server.close(r)); });
  return { pool, state, account, mail, configurations, createLane };
}

test('real TLS AUTH and SMTP DATA reuse a single isolated connection with no requeues', async t => {
  const { pool, state, account, mail, configurations } = await setup(t);
  const first = createTiming('send'), warm = createTiming('send');
  await pool.send(account, mail, first); await pool.send(account, mail, warm);
  assert.equal(state.accepted, 2); assert.equal(state.connections, 1); assert.equal(state.auth, 1);
  assert.equal(first.snapshot().smtp_connection_reused, false); assert.equal(warm.snapshot().smtp_connection_reused, true);
  assert.ok(first.snapshot().smtp_connect_ms > 0); assert.equal(warm.snapshot().smtp_connect_ms, 0);
  assert.equal(configurations[0].maxRequeues, 0); assert.equal(configurations[0].maxConnections, 1);
  await pool.send({ ...account, user_id: 2 }, mail); assert.equal(state.connections, 2);
  assert.ok(!pool.entry.key.includes(account.smtp_secret));
});
test('same account concurrent sends serialize without parallel SMTP sessions', async t => {
  const { pool, state, account, mail } = await setup(t);
  await Promise.all(Array.from({ length: 4 }, () => pool.send(account, mail)));
  assert.equal(state.accepted, 4); assert.equal(state.connections, 1);
});
test('maxMessages recycles transport connections without duplicating submissions', async t => {
  const { pool, state, account, mail } = await setup(t);
  for (let i = 0; i < 52; i++) await pool.send(account, mail);
  assert.equal(state.accepted, 52); assert.equal(state.connections, 2);
});
test('fresh permission validation rejects revoked credentials before touching SMTP', async t => {
  let allowed = true;
  const { pool, state, account, mail } = await setup(t, { validate: async () => allowed });
  await pool.send(account, mail); allowed = false;
  await assert.rejects(pool.send(account, mail), { code: 'SMTP_ACCOUNT_INVALID' });
  assert.equal(state.accepted, 1); assert.equal(pool.entry, null);
});
test('idle timeout is longer than active timeout; expiry still destroys sockets', async t => {
  const { pool, state, account, mail } = await setup(t, { activeMs: 200, idleMs: 700 });
  await pool.send(account, mail); await delay(300);
  await pool.send(account, mail); assert.equal(state.connections, 1);
  assert.equal([...pool.entry.sockets][0].timeout, 15700);
  await delay(800); assert.equal(pool.entry, null);
  await pool.send(account, mail); assert.equal(state.connections, 2);
});
test('broken idle connection is replaced only for the next distinct send', async t => {
  const { pool, state, account, mail } = await setup(t);
  await pool.send(account, mail); for (const socket of state.sockets) socket.destroy(); await delay(60);
  const timing = createTiming('send'); await pool.send(account, mail, timing);
  assert.equal(state.accepted, 2); assert.equal(state.connections, 2); assert.equal(timing.snapshot().smtp_reconnect_count, 1);
});
test('lost final 250 never requeues an already accepted message', async t => {
  const { pool, state, account, mail } = await setup(t);
  state.mode = 'lost250'; await assert.rejects(pool.send(account, mail));
  await delay(150); assert.equal(state.accepted, 1); assert.equal(state.connections, 1); assert.equal(pool.entry, null);
  state.mode = 'ok'; await pool.send(account, mail); assert.equal(state.accepted, 2);
});
test('active inactivity timeout remains short after reuse; no replay on timeout', async t => {
  const { pool, state, account, mail } = await setup(t, { activeMs: 150, idleMs: 1000 });
  await pool.send(account, mail); state.mode = 'hold';
  await assert.rejects(pool.send(account, mail)); assert.equal(state.accepted, 2); assert.equal(pool.entry, null);
});
test('credential rotation and explicit disconnect invalidate old transport immediately', async t => {
  const { pool, state, account, mail } = await setup(t);
  await pool.send(account, mail); const old = pool.entry;
  await pool.send({ ...account, smtp_secret: 'new-sealed' }, mail); assert.equal(old.closed, true); assert.equal(state.connections, 2);
  pool.invalidate(account.user_id); assert.equal(pool.entry, null);
  await pool.send(account, mail); assert.equal(state.connections, 3);
});
test('revocation and shutdown cancel active/queued work and leave no retained sockets', async t => {
  for (const stop of ['invalidate', 'shutdown']) {
    const { pool, state, account, mail } = await setup(t);
    state.mode = 'hold';
    const first = pool.send(account, mail), queued = pool.send(account, mail);
    const settled = Promise.allSettled([first, queued]);
    while (!state.accepted) await delay(5);
    pool[stop](account.user_id);
    assert.ok((await settled).every(r => r.status === 'rejected'));
    assert.equal(state.accepted, 1); assert.equal(pool.entry, null);
    if (stop === 'shutdown') await assert.rejects(pool.send(account, mail));
  }
});
test('queue limit and queue wait timeout reject unsent work without retry', async t => {
  const { pool, state, account, mail } = await setup(t, { maxQueued: 1, waitMs: 60, operationMs: 200 });
  state.mode = 'hold'; const first = pool.send(account, mail); const firstResult = assert.rejects(first);
  const second = assert.rejects(pool.send(account, mail), { code: 'SMTP_POOL_WAIT_TIMEOUT' });
  await assert.rejects(pool.send(account, mail), { code: 'SMTP_POOL_BUSY' });
  await second; await firstResult; assert.equal(state.accepted, 1);
});
test('TLS certificate verification stays enabled', async t => {
  const { pool, state, account, mail } = await setup(t, { connect: opts => tls.connect({ ...opts, host: '127.0.0.1' }) });
  await assert.rejects(pool.send(account, mail)); assert.equal(state.accepted, 0);
});
test('process crash after final acceptance cannot replay on restart', async t => {
  const { state, account, mail } = await setup(t);
  const script = path.join(directory, 'crash-fixture.cjs');
  fs.writeFileSync(script, `const tls = require('node:tls');
    const { MailboxSmtpPool } = require(${JSON.stringify(require.resolve('../src/lib/mailboxSmtpPool'))});
    const nodemailer = require(${JSON.stringify(require.resolve('nodemailer'))});
    const pool = new MailboxSmtpPool({createTransport: o => nodemailer.createTransport(o),
      password: () => 'FixtureOnly42!', validate: async () => true,
      connect: o => tls.connect({...o,host:'127.0.0.1',ca:require('node:fs').readFileSync(${JSON.stringify(path.join(directory,'cert.pem'))})})});
    process.on('message', async data => { if(data.send) {await pool.send(data.account,data.mail);process.send('accepted');}
      else {pool.shutdown();process.exit(0);} });`);
  const { fork } = require('node:child_process');
  const child = fork(script, { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  const accepted = new Promise(r => child.once('message', r));
  child.send({ send: true, account, mail }); await accepted;
  const exited = new Promise(r => child.once('exit', r)); child.kill('SIGKILL'); await exited;
  const restart = fork(script, { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  const finished = new Promise(r => restart.once('exit', r)); restart.send({ send: false }); await finished;
  assert.equal(state.accepted, 1);
});
test('owner pilot gate excludes other users, mailboxes, workers and disabled flag', () => {
  const adapter = require('../src/lib/mailboxSmtp');
  const saved = { ...process.env };
  try {
    Object.assign(process.env, { MAILBOX_SMTP_POOL_ENABLED: 'true', MAILBOX_SMTP_POOL_API_PROCESSES: '1', NODE_APP_INSTANCE: '0' });
    const account = { user_id: 1, smtp_secret: 'fixture', role: 'owner', mailbox_address: 'mooncci@mooncci.site' };
    assert.equal(adapter.poolingEnabled(account), true);
    assert.equal(adapter.poolingEnabled({ ...account, role: 'user' }), false);
    assert.equal(adapter.poolingEnabled({ ...account, mailbox_address: 'other@mooncci.site' }), false);
    process.env.MAILBOX_SMTP_POOL_API_PROCESSES = '2'; assert.equal(adapter.poolingEnabled(account), false);
    process.env.MAILBOX_SMTP_POOL_API_PROCESSES = '1'; process.env.NODE_APP_INSTANCE = '1'; assert.equal(adapter.poolingEnabled(account), false);
    process.env.NODE_APP_INSTANCE = '0'; process.env.MAILBOX_SMTP_POOL_ENABLED = 'false'; assert.equal(adapter.poolingEnabled(account), false);
  } finally {
    for (const key of ['MAILBOX_SMTP_POOL_ENABLED', 'MAILBOX_SMTP_POOL_API_PROCESSES', 'NODE_APP_INSTANCE']) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
    adapter.shutdown();
  }
});
const { MailboxPoolManager } = require('../src/lib/mailboxPoolManager');
test('multi-user real TLS SMTP isolates A/B/C, allows independent work and evicts idle only', async t => {
  const { createLane, state, account, mail } = await setup(t);
  const manager = new MailboxPoolManager({ protocol: 'smtp', limit: 2, create: () => createLane() });
  t.after(() => manager.shutdown());
  const a = account, b = { ...account, user_id: 2, mailbox_address: 'b@example.invalid', smtp_secret: 'sealed-b' };
  const c = { ...account, user_id: 3, mailbox_address: 'c@example.invalid', smtp_secret: 'sealed-c' };
  const send = (user, timing) => manager.run(user, lane => lane.send(user, { ...mail, envelope: { ...mail.envelope, from: user.mailbox_address } }, timing), { timing });
  await send(a); await send(b); const wa = createTiming('send'), wb = createTiming('send');
  await send(a, wa); await send(b, wb); assert(wa.snapshot().smtp_connection_reused); assert(wb.snapshot().smtp_connection_reused);
  state.mode = 'hold'; const pa = send(a), pb = send(b);
  while (state.pendingReplies.length < 2) await delay(2);
  assert.equal(manager.snapshot().active, 2);
  let cDone = false; const pc = send(c).then(() => { cDone = true; });
  await delay(5); assert(!cDone); assert.equal(manager.snapshot().waiting, 1);
  state.mode = 'ok'; state.pendingReplies.splice(0).forEach(release => release()); await Promise.all([pa, pb, pc]);
  assert.equal(state.crossed, 0); assert.equal(state.accepted, 7); assert(manager.snapshot().evictions >= 1);
  await send(b); manager.invalidate(a.user_id); const before = state.connections; await send(b); assert.equal(state.connections, before);
  manager.shutdown(); await delay(30); assert.equal(state.sockets.size, 0); assert.equal(manager.entries.size, 0);
});
test('trusted CA with wrong hostname still fails TLS without DATA', async t => {
  const { pool, state, account, mail } = await setup(t);
  await assert.rejects(pool.send({ ...account, smtp_host: 'wrong-host.invalid' }, mail));
  assert.equal(state.accepted, 0);
});
test('local 10/20/50-user pressure stays bounded, delivers each submitted operation once and releases sockets', async t => {
  const { createLane, state, account, mail } = await setup(t);
  const manager = new MailboxPoolManager({ protocol: 'smtp', limit: 4, create: () => createLane() });
  t.after(() => manager.shutdown());
  for (const count of [10, 20, 50]) {
    const times = [], waits = []; let peak = 0;
    const sample = setInterval(() => { peak = Math.max(peak, manager.entries.size); }, 1);
    const before = state.accepted;
    await Promise.all(Array.from({ length: count }, async (_, i) => {
      const a = { ...account, user_id: i + 10, mailbox_address: `test-${i}@example.invalid`, smtp_secret: `sealed-${i}` };
      const timing = createTiming('send'), began = performance.now();
      await manager.run(a, lane => lane.send(a, { ...mail, envelope: { ...mail.envelope, from: a.mailbox_address } }, timing), { timing });
      times.push(performance.now() - began); waits.push(timing.snapshot().smtp_pool_wait_ms);
    }));
    clearInterval(sample); assert(peak <= 4); assert.equal(state.accepted - before, count); assert.equal(state.crossed, 0);
    times.sort((a,b)=>a-b); waits.sort((a,b)=>a-b);
    const q = (xs,p) => Math.round(xs[Math.ceil(xs.length*p)-1]*10)/10;
    console.log(JSON.stringify({ fixture: 'localhost-TLS-SMTP', users: count, peak, p50: q(times,.5), p95: q(times,.95), p99: q(times,.99), wait_p50:q(waits,.5), wait_p95:q(waits,.95), ...manager.snapshot() }));
  }
  manager.shutdown(); await delay(50); assert.equal(state.sockets.size, 0);
});

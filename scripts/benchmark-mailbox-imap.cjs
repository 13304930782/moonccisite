// Explicitly read-only owner benchmark. Run on Beijing with --live-root and optional --library-root.
// It uses the candidate library with deployed dependencies, without replacing production files.
const fs = require('node:fs');
const path = require('node:path');
const { Module, createRequire } = require('node:module');
const { performance } = require('node:perf_hooks');
const argument = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const live = argument('--live-root', '/www/wwwroot/mooncci-source/server');
const lib = argument('--library-root', path.join(live, 'src/lib'));
const liveRequire = createRequire(path.join(live, 'src/lib/runtime.js'));
liveRequire('dotenv').config({ path: path.join(live, '.env'), quiet: true });
const db = liveRequire('../db');
const vendor = createRequire(path.join(live, 'src/lib/mailbox-vendor/runtime.js'));
const { ImapFlow } = vendor('imapflow');
const { createTiming } = require(path.join(lib, 'mailboxTiming.js'));
const allowed = new Set(['CAPABILITY', 'ID', 'AUTHENTICATE', 'LOGIN', 'NAMESPACE', 'ENABLE', 'LIST', 'LSUB', 'EXAMINE', 'FETCH', 'UID FETCH', 'NOOP']);
const exec = ImapFlow.prototype.exec;
ImapFlow.prototype.exec = function(command, ...args) {
  if (!allowed.has(command)) throw Object.assign(Error('Read-only benchmark blocked command'), { code: 'BENCH_WRITE_BLOCKED' });
  return exec.call(this, command, ...args);
};
const lock = ImapFlow.prototype.getMailboxLock;
ImapFlow.prototype.getMailboxLock = function(folder, options) { return lock.call(this, folder, { ...options, readOnly: true }); };
ImapFlow.prototype.messageFlagsAdd = async () => { throw Object.assign(Error('Read-only benchmark blocked flags'), { code: 'BENCH_WRITE_BLOCKED' }); };
// Resolve the candidate adapter's original imports against production, except the new pool module.
const candidate = new Module(path.join(live, 'src/lib/mailboxImap.js'));
candidate.filename = path.join(live, 'src/lib/mailboxImap.js');
candidate.paths = Module._nodeModulePaths(path.join(live, 'src/lib'));
candidate.require = name => name === './mailboxImapPool' ? require(path.join(lib, 'mailboxImapPool.js')) : liveRequire(name);
candidate._compile(fs.readFileSync(path.join(lib, 'mailboxImap.js'), 'utf8'), candidate.filename);
const imap = candidate.exports;
const round = x => Math.round(x * 10) / 10;
const percentile = (a, p) => [...a].sort((x, y) => x - y)[Math.ceil(a.length * p) - 1];
const results = [];
let account;
async function sample(operation, mode, uid, validity) {
  const timing = createTiming(operation);
  const began = performance.now();
  if (mode === 'cold') imap.invalidate(account.user_id);
  if (operation === 'list') await imap.listMessages(account, 'inbox', 1, timing);
  else {
    const message = await imap.readMessage(account, 'inbox', uid, validity, timing);
    if (!message || message.tooLarge) throw Object.assign(Error('Benchmark message changed'), { code: 'BENCH_MESSAGE_CHANGED' });
  }
  const record = { operation, mode, ...timing.snapshot(), elapsed_ms: round(performance.now() - began) };
  results.push(record);
  console.log(JSON.stringify({ event: 'benchmark_sample', ...record }));
}
async function main() {
  process.env.MAILBOX_TIMING_ENABLED = 'false'; // Emit only this script's numeric allowlist.
  process.env.MAILBOX_IMAP_POOL_ENABLED = 'true';
  process.env.MAILBOX_IMAP_POOL_API_PROCESSES = '1';
  process.env.NODE_APP_INSTANCE = '0';
  const [rows] = await db.query(`SELECT m.user_id,m.mailbox_address,m.smtp_secret,u.role FROM mailbox_access m
    JOIN users u ON u.id=m.user_id LEFT JOIN mailbox_password_changes p ON p.user_id=m.user_id
    WHERE u.role='owner' AND u.status='active' AND m.status='active' AND m.mailbox_address='mooncci@mooncci.site'
    AND (p.status IS NULL OR p.status='complete') LIMIT 1`);
  account = rows[0]; if (!account) throw Object.assign(Error('Owner unavailable'), { code: 'BENCH_OWNER_UNAVAILABLE' });
  const initial = await imap.listMessages(account, 'inbox', 1);
  const message = initial.messages.find(item => !item.unread && item.size <= 2 * 1024 * 1024);
  if (!message) throw Object.assign(Error('No already-read small message'), { code: 'BENCH_NO_SAFE_MESSAGE' });
  for (let i = 0; i < 10; i++) await sample('list', 'cold');
  for (let i = 0; i < 30; i++) await sample('list', 'warm');
  for (let i = 0; i < 10; i++) await sample('read', 'cold', message.uid, initial.uidValidity);
  for (let i = 0; i < 30; i++) await sample('read', 'warm', message.uid, initial.uidValidity);
  for (const operation of ['list', 'read']) for (const mode of ['cold', 'warm']) {
    const records = results.filter(r => r.operation === operation && r.mode === mode);
    console.log(JSON.stringify({ event: 'benchmark_summary', operation, mode, n: records.length,
      p50_ms: percentile(records.map(r => r.elapsed_ms), 0.5), p95_ms: percentile(records.map(r => r.elapsed_ms), 0.95),
      connect_p50_ms: round(percentile(records.map(r => r.imap_connect_ms), 0.5)),
      reused: records.filter(r => r.connection_reused).length,
      reconnects: records.reduce((sum, r) => sum + r.reconnect_count, 0) }));
  }
}
const deadline = setTimeout(() => { imap.shutdown(); process.exitCode = 1; }, 15 * 60 * 1000);
main().catch(error => { console.error(JSON.stringify({ event: 'benchmark_failed', code: /^[A-Z_]+$/.test(error.code || '') ? error.code : 'BENCH_FAILED' })); process.exitCode = 1; })
  .finally(async () => { clearTimeout(deadline); imap.shutdown(); await db.end(); });

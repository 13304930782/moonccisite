const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createTiming } = require('../src/lib/mailboxTiming');

function fixture(t, pooled = true, idleMs) {
  const clients = [];
  const account = { user_id: 1, role: 'owner', mailbox_address: 'mooncci@mooncci.site', smtp_secret: 'cipher' };
  class Client extends EventEmitter {
    constructor(options) { super(); this.options = options; this.mailbox = { exists: 1, uidValidity: 42 }; this.releases = 0; this.flags = 0; this.appends = 0; clients.push(this); }
    async connect() { this.usable = true; }
    close() { this.usable = false; this.emit('close'); }
    async noop() {}
    async list() { return [{ path: 'Sent', specialUse: '\\Sent' }]; }
    async getMailboxLock(folder, options) { this.readOnly = options.readOnly; return { release: () => this.releases++ }; }
    async fetchAll() { if (this.failFetch) throw Error('network'); return [{ uid: 1, flags: new Set(), size: 10 }]; }
    async fetchOne(uid, query) { return query.source ? { source: Buffer.from('test source') } : { uid, size: 10, flags: new Set(this.seen ? ['\\Seen'] : []) }; }
    async messageFlagsAdd() { this.flags++; }
    async append() { this.appends++; if (this.failAppend) throw Error('ack lost'); return { uid: 1 }; }
  }
  const env = { MAILBOX_SMTP_HOST: 'mail.example.invalid', MAILBOX_IMAP_POOL_ENABLED: String(pooled), MAILBOX_IMAP_POOL_API_PROCESSES: '1' };
  if (idleMs !== undefined) env.MAILBOX_IMAP_POOL_IDLE_MS = idleMs;
  const module = { exports: {} };
  const dependencies = {
    path,
    module: { createRequire: () => name => name === 'imapflow' ? { ImapFlow: Client } : { simpleParser: async () => ({ text: 'parsed', attachments: [] }) } },
    './mailboxSecurity': { open: () => 'private-password' },
    './mailboxImapPool': require('../src/lib/mailboxImapPool'),
    './mailboxPoolManager': require('../src/lib/mailboxPoolManager'),
    './mailboxPoolPolicy': { ...require('../src/lib/mailboxPoolPolicy'),
      poolingEnabled: (a, protocol) => require('../src/lib/mailboxPoolPolicy').poolingEnabled(a, protocol, env),
      validateAccount: async a => a.smtp_secret === account.smtp_secret },

    './mailboxTiming': { poolEvent() {} },
    '../db': { query: async () => [[account]] },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/lib/mailboxImap.js'), 'utf8'), {
    module, require: name => { if (!dependencies[name]) throw Error(name); return dependencies[name]; },
    __dirname, process: { env }, console,
  });
  const imap = module.exports; t.after(() => imap.shutdown());
  return { imap, clients, account, env };
}

test('actual list/read adapter releases mailbox locks on success and rejection', async t => {
  const { imap, clients, account } = fixture(t);
  await imap.listMessages(account, 'inbox', 1);
  assert.equal(clients[0].releases, 1); assert.equal(clients[0].readOnly, true);
  await imap.readMessage(account, 'inbox', 1, '42');
  assert.equal(clients[0].releases, 2); assert.equal(clients[0].flags, 1); assert.equal(clients[0].readOnly, false);
  clients[0].failFetch = true;
  await assert.rejects(imap.listMessages(account, 'inbox', 1));
  assert.equal(clients[0].releases, 3); assert.equal(clients[0].usable, false);
});

test('five-minute owner pilot keeps socket watchdog above idle TTL; invalid values retain short lifecycle', async t => {
  for (const [setting, expected] of [['300000', 315000], ['Infinity', 45000], ['0', 45000], ['999999999', 45000]]) {
    const { imap, clients, account } = fixture(t, true, setting);
    await imap.listMessages(account, 'inbox', 1);
    assert.equal(clients[0].options.socketTimeout, expected);
    assert.equal(clients[0].options.disableAutoIdle, true);
  }
});

test('Sent read does not mark Seen; APPEND remains awaited and is never retried', async t => {
  const { imap, clients, account } = fixture(t);
  await imap.readMessage(account, 'sent', 1, '42');
  assert.equal(clients[0].flags, 0); assert.equal(clients[0].readOnly, true);
  clients[0].failAppend = true;
  await assert.rejects(imap.appendSent(account, Buffer.from('raw')));
  assert.equal(clients[0].appends, 1);
});

test('owner gate, feature flag and multiworker declaration preserve cold fallback', async t => {
  const { imap, clients, account, env } = fixture(t);
  assert.equal(imap.poolingEnabled(account), true);
  assert.equal(imap.poolingEnabled({ ...account, role: 'user' }), false);
  assert.equal(imap.poolingEnabled({ ...account, mailbox_address: 'other@mooncci.site' }), false);
  env.MAILBOX_IMAP_POOL_API_PROCESSES = '2'; assert.equal(imap.poolingEnabled(account), false);
  env.MAILBOX_IMAP_POOL_API_PROCESSES = '1'; env.NODE_APP_INSTANCE = '1'; assert.equal(imap.poolingEnabled(account), false);
  env.NODE_APP_INSTANCE = '0'; env.MAILBOX_IMAP_POOL_ENABLED = 'false';
  await imap.listMessages(account, 'inbox', 1); await imap.listMessages(account, 'inbox', 1);
  assert.equal(clients.length, 2); assert.equal(clients.every(c => !c.usable), true);
  assert.equal(clients[0].options.socketTimeout, 20000);
});

test('pooled adapter records stage timings and uses socket timeout longer than idle TTL', async t => {
  const { imap, clients, account } = fixture(t);
  const timing = createTiming('read');
  await imap.listMessages(account, 'inbox', 1);
  await imap.readMessage(account, 'inbox', 1, '42', timing);
  assert.equal(clients.length, 1); assert.equal(clients[0].options.socketTimeout, 45000);
  const result = timing.snapshot();
  assert.equal(result.connection_reused, true);
  for (const key of ['account_lookup_ms', 'pool_wait_ms', 'imap_health_ms', 'folder_lookup_ms', 'mailbox_select_ms', 'metadata_fetch_ms', 'source_fetch_ms', 'parse_ms', 'flags_ms']) assert.ok(result[key] >= 0);
});

#!/usr/bin/env node
// Run explicitly on Beijing against a verified disposable local US recipient.
// Never retries a send. Never logs message content, addresses, auth or errors.
const path = require('node:path');
const { createRequire } = require('node:module');
const { performance } = require('node:perf_hooks');
const { randomUUID } = require('node:crypto');
const root = process.env.MOONCCI_SERVER_ROOT || '/www/wwwroot/mooncci-source/server';
const local = createRequire(path.join(root, 'package.json'));
const db = local('./src/db');
const { open } = local('./src/lib/mailboxSecurity');
const nodemailer = local('nodemailer');
const MailComposer = local('nodemailer/lib/mail-composer');
const recipient = process.argv[2];
const rows = [];
const transports = new Set();
let current = null;
let connections = 0;
const round = n => Math.round(n * 10) / 10;
const record = data => {
  // Whitelist structured events; never retain logger args or data.username.
  if (!current || !data) return;
  if (data.tnx === 'network' && data.remotePort) {
    connections++;
    current.smtp_connect_ms = round(performance.now() - current.start);
  }
  if (data.action === 'authenticated') current.smtp_setup_ms = round(performance.now() - current.start);
};
const logger = Object.fromEntries(['trace', 'debug', 'info', 'warn', 'error', 'fatal'].map(level => [level, record]));

async function main() {
  if (!/^codex-perf-[0-9a-f]{10}@mooncci\.site$/.test(recipient || '')) throw new Error('Invalid local recipient');
  if (Number(process.env.MAILBOX_SMTP_PORT || 465) !== 465) throw new Error('Expected production implicit TLS');
  const [accounts] = await db.query(`SELECT m.mailbox_address,m.smtp_secret FROM mailbox_access m
    JOIN users u ON u.id=m.user_id WHERE u.role='owner' AND u.status='active'
    AND m.status='active' AND m.mailbox_address='mooncci@mooncci.site'`);
  if (accounts.length !== 1) throw new Error('Owner account unavailable');
  const account = accounts[0];
  const make = pooled => {
    const transport = nodemailer.createTransport({ host: process.env.MAILBOX_SMTP_HOST, port: 465, secure: true,
      requireTLS: true, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
      auth: { user: account.mailbox_address, pass: open(account.smtp_secret, account.mailbox_address) },
      pool: pooled, maxConnections: 1, maxMessages: 100, maxRequeues: 0, logger, debug: false });
    transports.add(transport);
    return transport;
  };
  const run = async (transport, group, index) => {
    const mail = { from: account.mailbox_address, to: recipient, subject: 'Local SMTP performance fixture',
      text: 'Disposable local delivery fixture. No external delivery.', messageId: randomUUID() + '@mooncci.site',
      envelope: { from: account.mailbox_address, to: [recipient] } };
    const raw = await new MailComposer(mail).compile().build();
    const before = connections;
    current = { start: performance.now(), smtp_connect_ms: 0, smtp_setup_ms: 0 };
    try {
      const info = await transport.sendMail({ raw, from: mail.from, to: recipient, envelope: mail.envelope });
      if (info.accepted?.length !== 1 || info.accepted[0].toLowerCase() !== recipient) throw new Error('Recipient not accepted');
      const row = { group, index, smtp_submit_ms: round(performance.now() - current.start),
        smtp_connect_ms: current.smtp_connect_ms, smtp_setup_ms: current.smtp_setup_ms,
        smtp_connection_reused: connections === before, smtp_reconnect_count: group === 'warm' ? connections - before : 0,
        smtp_pool_wait_ms: null, accepted: true };
      rows.push(row);
      console.log(JSON.stringify({ event: 'smtp_benchmark', ...row }));
    } finally { current = null; }
  };
  for (let i = 0; i < 10; i++) { const t = make(false); try { await run(t, 'cold', i + 1); } finally { t.close(); transports.delete(t); } }
  const pooled = make(true);
  await run(pooled, 'pool_setup', 0);
  for (let i = 0; i < 30; i++) await run(pooled, 'warm', i + 1);
  const stats = group => {
    const values = rows.filter(r => r.group === group).map(r => r.smtp_submit_ms).sort((a,b) => a-b);
    return { n: values.length, p50: values[Math.ceil(values.length * .5) - 1], p95: values[Math.ceil(values.length * .95) - 1] };
  };
  console.log(JSON.stringify({ event: 'smtp_summary', cold: stats('cold'), warm: stats('warm'), accepted: rows.length,
    measurement: 'real TLS/AUTH/MAIL/RCPT/DATA/final acceptance; sequential local recipient; pool wait not exposed' }));
}
main().catch(() => { console.error(JSON.stringify({ event: 'smtp_benchmark_failed', completed: rows.length, retry: false })); process.exitCode = 1; })
  .finally(async () => { for (const t of transports) t.close(); await db.end(); });

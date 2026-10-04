const path = require('path');
const { createRequire } = require('module');
// The offline release places this feature's dependencies here to avoid changing
// other production packages (notably the site's existing Nodemailer version).
const mailRequire = createRequire(path.join(__dirname, 'mailbox-vendor', 'runtime.js'));
const { ImapFlow } = mailRequire('imapflow');
const { simpleParser } = mailRequire('mailparser');
const { open } = require('./mailboxSecurity');
const { MailboxImapPool } = require('./mailboxImapPool');
const { poolEvent } = require('./mailboxTiming');

const PAGE_SIZE = 25;
const MAX_MESSAGE_BYTES = 2 * 1024 * 1024;
// Bounded rollout choices: never accept Infinity/zero or an unbounded environment value.
const POOL_IDLE_MS = process.env.MAILBOX_IMAP_POOL_IDLE_MS === '300000' ? 300000 : 30000;

function makeClient(account, pooled = false) {
  const host = process.env.MAILBOX_IMAP_HOST || process.env.MAILBOX_SMTP_HOST;
  if (!host) throw new Error('MAILBOX_IMAP_HOST is not configured');
  const client = new ImapFlow({
    host, port: Number(process.env.MAILBOX_IMAP_PORT || 993), secure: true,
    auth: { user: account.mailbox_address, pass: open(account.smtp_secret, account.mailbox_address) },
    logger: false, connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: pooled ? POOL_IDLE_MS + 15000 : 20000,
    disableAutoIdle: true,
  });
  // ImapFlow emits errors independently of awaited operations. Never log credentials or message content.
  client.on('error', () => {});
  return client;
}

const pool = new MailboxImapPool({
  createClient: account => makeClient(account, true),
  maxConnections: 1, idleMs: POOL_IDLE_MS, observe: poolEvent,
  validate: async (account, timing) => {
    const check = async () => {
      const [rows] = await require('../db').query(`SELECT m.mailbox_address, m.smtp_secret
        FROM mailbox_access m JOIN users u ON u.id=m.user_id
        LEFT JOIN mailbox_password_changes p ON p.user_id=m.user_id
        WHERE m.user_id=? AND m.status='active' AND u.status='active' AND u.role='owner'
        AND (p.status IS NULL OR p.status='complete')`, [account.user_id]);
      return rows[0]?.mailbox_address === account.mailbox_address && rows[0]?.smtp_secret === account.smtp_secret;
    };
    return timing ? timing.measure('account_lookup_ms', check) : check();
  },
});

function poolingEnabled(account) {
  // This release deliberately cannot enable pooling for ordinary users or multiple API workers.
  return process.env.MAILBOX_IMAP_POOL_ENABLED === 'true' && process.env.MAILBOX_IMAP_POOL_API_PROCESSES === '1'
    && (!process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0')
    && account.role === 'owner' && account.mailbox_address === 'mooncci@mooncci.site';
}

async function withClient(account, work, timing) {
  if (poolingEnabled(account)) return pool.run({ ...account,
    imap_host: process.env.MAILBOX_IMAP_HOST || process.env.MAILBOX_SMTP_HOST,
    imap_port: Number(process.env.MAILBOX_IMAP_PORT || 993),
  }, work, timing);
  // Feature-flag fallback keeps the original cold-connection behavior.
  pool.invalidate(account.user_id);
  const client = makeClient(account);
  try {
    await measure(timing, 'imap_connect_ms', () => client.connect());
    return await work(client);
  } finally {
    client.close();
  }
}

function measure(timing, stage, work) { return timing ? timing.measure(stage, work) : work(); }

async function sentPath(client) {
  const boxes = await client.list();
  return boxes.find(box => box.specialUse === '\\Sent')?.path ||
    boxes.find(box => /^(sent|sent messages|sent items)$/i.test(box.path))?.path || null;
}

async function folderPath(client, folder) {
  return folder === 'inbox' ? 'INBOX' : sentPath(client);
}

function address(value) {
  return (value || []).map(item => item.name ? `${item.name} <${item.address}>` : item.address).join(', ');
}

function summary(item) {
  return { uid: item.uid, from: address(item.envelope?.from), to: address(item.envelope?.to),
    subject: item.envelope?.subject || '(无主题)', date: item.internalDate || item.envelope?.date || null,
    unread: !item.flags?.has('\\Seen'), size: item.size || 0 };
}

async function listMessages(account, folder, page, timing) {
  return withClient(account, async client => {
    const path = await measure(timing, 'folder_lookup_ms', () => folderPath(client, folder));
    if (!path) return { messages: [], total: 0, page, pageSize: PAGE_SIZE, uidValidity: null, folderAvailable: false };
    const lock = await measure(timing, 'mailbox_select_ms', () => client.getMailboxLock(path, { readOnly: true }));
    try {
      const total = client.mailbox.exists;
      const end = total - (page - 1) * PAGE_SIZE;
      const start = Math.max(1, end - PAGE_SIZE + 1);
      const rows = end > 0 ? await measure(timing, 'fetch_ms', () => client.fetchAll(`${start}:${end}`,
        { uid: true, envelope: true, internalDate: true, flags: true, size: true })) : [];
      return { messages: rows.reverse().map(summary), total, page, pageSize: PAGE_SIZE,
        uidValidity: String(client.mailbox.uidValidity), folderAvailable: true };
    } finally { lock.release(); }
  }, timing);
}

async function readMessage(account, folder, uid, uidValidity, timing) {
  return withClient(account, async client => {
    const path = await measure(timing, 'folder_lookup_ms', () => folderPath(client, folder));
    if (!path) return null;
    const lock = await measure(timing, 'mailbox_select_ms', () => client.getMailboxLock(path, { readOnly: folder !== 'inbox' }));
    try {
      if (String(client.mailbox.uidValidity) !== uidValidity) return null;
      const metadata = await measure(timing, 'metadata_fetch_ms', () => client.fetchOne(uid, { uid: true, envelope: true, internalDate: true,
        flags: true, size: true }, { uid: true }));
      if (!metadata) return null;
      if (metadata.size > MAX_MESSAGE_BYTES) return { ...summary(metadata), tooLarge: true };
      const item = await measure(timing, 'source_fetch_ms', () => client.fetchOne(uid, { source: true }, { uid: true }));
      if (!item?.source || item.source.length > MAX_MESSAGE_BYTES) return { ...summary(metadata), tooLarge: true };
      const parsed = await measure(timing, 'parse_ms', () => simpleParser(item.source, { maxHtmlLengthToParse: 500000,
        skipTextToHtml: true, skipTextLinks: true, skipImageLinks: true }));
      if (folder === 'inbox' && !metadata.flags?.has('\\Seen')) {
        await measure(timing, 'flags_ms', () => client.messageFlagsAdd(uid, ['\\Seen'], { uid: true }));
      }
      return { ...summary(metadata), unread: false, text: String(parsed.text || '').slice(0, 500000),
        replyTo: parsed.replyTo?.value?.[0]?.address || parsed.from?.value?.[0]?.address || '',
        attachments: parsed.attachments.map(part => ({ filename: part.filename || '附件', size: part.size || 0 })) };
    } finally { lock.release(); }
  }, timing);
}

async function appendSent(account, raw, timing) {
  return withClient(account, async client => {
    const path = await measure(timing, 'imap_sent_lookup_ms', () => sentPath(client));
    if (!path) throw new Error('Sent folder unavailable');
    const result = await measure(timing, 'imap_append_ms', () => client.append(path, raw, ['\\Seen']));
    if (!result) throw new Error('Sent copy was not saved');
  }, timing);
}

module.exports = { PAGE_SIZE, listMessages, readMessage, appendSent, poolingEnabled,
  invalidate: userId => pool.invalidate(userId), shutdown: () => pool.shutdown() };

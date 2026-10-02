const path = require('path');
const { createRequire } = require('module');
// The offline release places this feature's dependencies here to avoid changing
// other production packages (notably the site's existing Nodemailer version).
const mailRequire = createRequire(path.join(__dirname, 'mailbox-vendor', 'runtime.js'));
const { ImapFlow } = mailRequire('imapflow');
const { simpleParser } = mailRequire('mailparser');
const { open } = require('./mailboxSecurity');

const PAGE_SIZE = 25;
const MAX_MESSAGE_BYTES = 2 * 1024 * 1024;

function makeClient(account) {
  const host = process.env.MAILBOX_IMAP_HOST || process.env.MAILBOX_SMTP_HOST;
  if (!host) throw new Error('MAILBOX_IMAP_HOST is not configured');
  const client = new ImapFlow({
    host, port: Number(process.env.MAILBOX_IMAP_PORT || 993), secure: true,
    auth: { user: account.mailbox_address, pass: open(account.smtp_secret, account.mailbox_address) },
    logger: false, connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 20000,
    disableAutoIdle: true,
  });
  // ImapFlow emits errors independently of awaited operations. Never log credentials or message content.
  client.on('error', () => {});
  return client;
}

async function withClient(account, work) {
  const client = makeClient(account);
  try {
    await client.connect();
    return await work(client);
  } finally {
    client.close();
  }
}

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

async function listMessages(account, folder, page) {
  return withClient(account, async client => {
    const path = await folderPath(client, folder);
    if (!path) return { messages: [], total: 0, page, pageSize: PAGE_SIZE, uidValidity: null, folderAvailable: false };
    const lock = await client.getMailboxLock(path, { readOnly: true });
    try {
      const total = client.mailbox.exists;
      const end = total - (page - 1) * PAGE_SIZE;
      const start = Math.max(1, end - PAGE_SIZE + 1);
      const rows = end > 0 ? await client.fetchAll(`${start}:${end}`,
        { uid: true, envelope: true, internalDate: true, flags: true, size: true }) : [];
      return { messages: rows.reverse().map(summary), total, page, pageSize: PAGE_SIZE,
        uidValidity: String(client.mailbox.uidValidity), folderAvailable: true };
    } finally { lock.release(); }
  });
}

async function readMessage(account, folder, uid, uidValidity) {
  return withClient(account, async client => {
    const path = await folderPath(client, folder);
    if (!path) return null;
    const lock = await client.getMailboxLock(path, { readOnly: folder !== 'inbox' });
    try {
      if (String(client.mailbox.uidValidity) !== uidValidity) return null;
      const metadata = await client.fetchOne(uid, { uid: true, envelope: true, internalDate: true,
        flags: true, size: true }, { uid: true });
      if (!metadata) return null;
      if (metadata.size > MAX_MESSAGE_BYTES) return { ...summary(metadata), tooLarge: true };
      const item = await client.fetchOne(uid, { source: true }, { uid: true });
      if (!item?.source || item.source.length > MAX_MESSAGE_BYTES) return { ...summary(metadata), tooLarge: true };
      const parsed = await simpleParser(item.source, { maxHtmlLengthToParse: 500000,
        skipTextToHtml: true, skipTextLinks: true, skipImageLinks: true });
      if (folder === 'inbox' && !metadata.flags?.has('\\Seen')) {
        await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
      }
      return { ...summary(metadata), unread: false, text: String(parsed.text || '').slice(0, 500000),
        replyTo: parsed.replyTo?.value?.[0]?.address || parsed.from?.value?.[0]?.address || '',
        attachments: parsed.attachments.map(part => ({ filename: part.filename || '附件', size: part.size || 0 })) };
    } finally { lock.release(); }
  });
}

async function appendSent(account, raw) {
  return withClient(account, async client => {
    const path = await sentPath(client);
    if (!path) throw new Error('Sent folder unavailable');
    const result = await client.append(path, raw, ['\\Seen']);
    if (!result) throw new Error('Sent copy was not saved');
  });
}

module.exports = { PAGE_SIZE, listMessages, readMessage, appendSent };

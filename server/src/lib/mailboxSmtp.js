const nodemailer = require('nodemailer');
const { open } = require('./mailboxSecurity');
const { MailboxSmtpPool } = require('./mailboxSmtpPool');
function poolingEnabled(account) {
  return process.env.MAILBOX_SMTP_POOL_ENABLED === 'true' && process.env.MAILBOX_SMTP_POOL_API_PROCESSES === '1'
    && (!process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0')
    && account.role === 'owner' && account.mailbox_address === 'mooncci@mooncci.site';
}
const pool = new MailboxSmtpPool({ createTransport: options => nodemailer.createTransport(options),
  password: account => open(account.smtp_secret, account.mailbox_address),
  validate: async account => {
    const [rows] = await require('../db').query(`SELECT m.mailbox_address,m.smtp_secret FROM mailbox_access m
      JOIN users u ON u.id=m.user_id LEFT JOIN mailbox_password_changes p ON p.user_id=m.user_id
      WHERE m.user_id=? AND m.status='active' AND u.status='active' AND u.role='owner'
      AND (p.status IS NULL OR p.status='complete')`, [account.user_id]);
    return rows[0]?.mailbox_address === account.mailbox_address && rows[0]?.smtp_secret === account.smtp_secret;
  } });
async function send(account, mail, timing) {
  const host = process.env.MAILBOX_SMTP_HOST;
  if (!host) throw new Error('MAILBOX_SMTP_HOST is not configured');
  if (poolingEnabled(account)) return pool.send({ ...account, smtp_host: host,
    smtp_port: Number(process.env.MAILBOX_SMTP_PORT || 465) }, mail, timing);
  pool.invalidate(account.user_id);
  const transport = nodemailer.createTransport({ host, port: Number(process.env.MAILBOX_SMTP_PORT || 465),
    secure: true, requireTLS: true, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
    auth: { user: account.mailbox_address, pass: open(account.smtp_secret, account.mailbox_address) } });
  try { return await transport.sendMail(mail); } finally { transport.close?.(); }
}
module.exports = { send, poolingEnabled, invalidate: id => pool.invalidate(id), shutdown: () => pool.shutdown() };

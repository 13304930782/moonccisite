const nodemailer = require('nodemailer');
const { open } = require('./mailboxSecurity');
const { MailboxSmtpPool } = require('./mailboxSmtpPool');
const { MailboxPoolManager } = require('./mailboxPoolManager');
const policy = require('./mailboxPoolPolicy');
const { poolEvent } = require('./mailboxTiming');
function poolingEnabled(account) { return policy.poolingEnabled(account, 'SMTP'); }
const pool = new MailboxPoolManager({ protocol: 'smtp', limit: policy.budget('SMTP'), observe: poolEvent,
  create: (_account, retain, observe) => new MailboxSmtpPool({
    createTransport: options => nodemailer.createTransport(options), pooled: retain, observe,
    password: account => open(account.smtp_secret, account.mailbox_address), validate: policy.validateAccount,
  }),
});
async function send(account, mail, timing) {
  const host = process.env.MAILBOX_SMTP_HOST;
  if (!host) throw new Error('MAILBOX_SMTP_HOST is not configured');
  const configured = { ...account, smtp_host: host, smtp_port: Number(process.env.MAILBOX_SMTP_PORT || 465) };
  return pool.run(configured, resource => resource.send(configured, mail, timing), { retain: poolingEnabled(account), timing });
}
module.exports = { send, poolingEnabled, stats: () => pool.snapshot(), invalidate: id => pool.invalidate(id), shutdown: () => pool.shutdown() };

const crypto = require('crypto');

const DOMAIN = 'mooncci.site';
const RESERVED = new Set(['admin', 'administrator', 'abuse', 'contact', 'help', 'info', 'mail', 'mailer-daemon', 'mooncci', 'no-reply', 'noreply', 'postmaster', 'root', 'security', 'support', 'webmaster']);

function localPart(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return /^[a-z][a-z0-9._-]{2,31}$/.test(normalized) && !/[._-]{2}/.test(normalized) && !/[._-]$/.test(normalized) && !RESERVED.has(normalized)
    ? normalized : '';
}

function email(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.length <= 254 && !normalized.includes('..') &&
    /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(normalized) ? normalized : '';
}

function header(value, max = 120) {
  const normalized = String(value || '').replace(/[\r\n\x00-\x1f\x7f]/g, ' ').trim();
  return normalized.length <= max ? normalized : '';
}

function encryptionKey() {
  const raw = process.env.MAILBOX_SECRET_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(raw)) throw new Error('MAILBOX_SECRET_KEY is not configured');
  return Buffer.from(raw, 'hex');
}

function seal(secret, address) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(address));
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

function open(sealed, address) {
  const [version, iv, tag, payload] = String(sealed || '').split('.');
  if (version !== 'v1' || !iv || !tag || !payload) throw new Error('Invalid mailbox secret');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(address));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(payload, 'base64url')), decipher.final()]).toString('utf8');
}

module.exports = { DOMAIN, localPart, email, header, seal, open };

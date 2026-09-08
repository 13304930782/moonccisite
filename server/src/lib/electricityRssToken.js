const { roomContext, electricityEnv } = require('./electricityContext');
const crypto = require('crypto');

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
function currentScope(env) {
  if (!env && roomContext()) return roomContext().scope_key;
  env = env || electricityEnv();
  const account = String(env.ELECTRICITY_SCHOOL_ACCOUNT || '').trim();
  const room = String(env.ELECTRICITY_ROOM_VERIFY || '').trim();
  if (!account || !room) return null;
  return hash(
    JSON.stringify([
      'electricity-v1',
      account,
      room,
      env.ELECTRICITY_CUSTOMER_CODE || '2252',
    ]),
  );
}
function key() {
  if (!process.env.JWT_SECRET) throw new Error('RSS_KEY_UNAVAILABLE');
  return crypto
    .createHash('sha256')
    .update(`mooncci-electricity-rss-v1\0${process.env.JWT_SECRET}`)
    .digest();
}
function seal(token, context) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([
    cipher.update(token, 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}
function unseal(value, context) {
  const raw = Buffer.from(value, 'base64');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key(),
    raw.subarray(0, 12),
  );
  decipher.setAuthTag(raw.subarray(12, 28));
  decipher.setAAD(Buffer.from(context));
  return Buffer.concat([
    decipher.update(raw.subarray(28)),
    decipher.final(),
  ]).toString('utf8');
}
function siteOrigin() {
  const url = new URL(process.env.SITE_URL || '');
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error('RSS_SITE_URL_INVALID');
  return url.origin;
}
module.exports = { hash, currentScope, seal, unseal, siteOrigin };

const crypto = require('crypto');
const db = require('../db');
const PROVIDERS = Object.freeze({ github: 'GitHub', google: 'Google', qq: 'QQ', wechat: '微信', gitee: 'Gitee' });
const DEFAULT_GOOGLE_CLIENT_ID = '614401761904-4g7soo2d1clsnui71h5tb9ia4j1t530m.apps.googleusercontent.com';
const validProvider = value => Object.hasOwn(PROVIDERS, value);
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

function key() {
  const value = process.env.OAUTH_ENCRYPTION_KEY || process.env.JWT_SECRET || '';
  if (value.length < 24) throw new Error('OAuth encryption key unavailable');
  return crypto.hkdfSync('sha256', value, 'mooncci', 'oauth-secret-v1', 32);
}
function encrypt(secret, provider) {
  if (!secret) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(provider));
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(x => x.toString('base64')).join('.');
}
function decrypt(value, provider) {
  if (!value) return '';
  const [iv, tag, data] = value.split('.').map(x => Buffer.from(x, 'base64'));
  const cipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(provider)); cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
}
function siteOrigin() {
  const url = new URL(process.env.SITE_URL || 'https://mooncci.site');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('SITE_URL must use HTTPS');
  }
  return url.origin;
}
const callbackUrl = provider => `${siteOrigin()}/api/auth/${provider}/callback`;
async function getConfig(provider, connection = db, lock = false) {
  if (!validProvider(provider)) throw new Error('Unknown OAuth provider');
  const [rows] = await connection.query(`SELECT * FROM oauth_providers WHERE provider=?${lock ? ' FOR UPDATE' : ''}`, [provider]);
  const row = rows[0];
  if (row) return { ...row, enabled: Boolean(row.enabled), source: 'database' };
  // Preserve the already deployed Google Identity Services client until the owner saves an override.
  return { provider, enabled: provider === 'google', client_id: provider === 'google' ? (process.env.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID).trim() : '', secret_cipher: '', version: 0, source: provider === 'google' ? 'existing' : 'empty' };
}
const ready = config => Boolean(config.enabled && config.client_id && (config.provider === 'google' || config.secret_cipher));
function publicConfig(config) {
  return { provider: config.provider, name: PROVIDERS[config.provider], enabled: config.enabled, ready: ready(config), client_id: config.client_id, has_secret: Boolean(config.secret_cipher), version: config.version, source: config.source, callback_url: callbackUrl(config.provider), origin: siteOrigin() };
}
module.exports = { PROVIDERS, validProvider, sha256, encrypt, decrypt, getConfig, ready, publicConfig, siteOrigin, callbackUrl };

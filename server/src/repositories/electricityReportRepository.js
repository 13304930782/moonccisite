const crypto = require('crypto');
const db = require('../db');
const { hash, seal, unseal } = require('../lib/electricityRssToken');

function mapReport(row) {
  if (!row) return null;
  return {
    ...(typeof row.payload === 'string'
      ? JSON.parse(row.payload)
      : row.payload),
    id: row.id,
  };
}
async function getReport(scope, date, period) {
  const [rows] = await db.query(
    'SELECT id, payload FROM electricity_reports WHERE scope_key=? AND report_date=? AND period=?',
    [scope, date, period],
  );
  return mapReport(rows[0]);
}
async function saveReport(scope, report) {
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO electricity_reports (id, scope_key, report_date, period, published_at, payload)
    VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id=id`,
    [
      id,
      scope,
      report.reportDate,
      report.period,
      new Date(report.publishedAt).toISOString().slice(0, 23).replace('T', ' '),
      JSON.stringify(report),
    ],
  );
  return getReport(scope, report.reportDate, report.period);
}
async function listReports(scope) {
  const [rows] = await db.query(
    'SELECT id, payload FROM electricity_reports WHERE scope_key=? ORDER BY published_at DESC, id DESC LIMIT 60',
    [scope],
  );
  return rows.map(mapReport);
}
async function getSubscription(userId, scope) {
  const [rows] = await db.query(
    'SELECT token_encrypted FROM electricity_rss_subscriptions WHERE user_id=? AND scope_key=?',
    [userId, scope],
  );
  if (!rows[0]) return { token: null, resetRequired: false };
  try {
    return {
      token: unseal(rows[0].token_encrypted, `${userId}:${scope}`),
      resetRequired: false,
    };
  } catch {
    return { token: null, resetRequired: true };
  }
}
async function createSubscription(userId, scope, reset = false) {
  const token = crypto.randomBytes(32).toString('hex');
  const suffix = reset
    ? 'token_hash=VALUES(token_hash), token_encrypted=VALUES(token_encrypted)'
    : 'user_id=user_id';
  await db.query(
    `INSERT INTO electricity_rss_subscriptions (user_id, scope_key, token_hash, token_encrypted)
    VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE ${suffix}`,
    [userId, scope, hash(token), seal(token, `${userId}:${scope}`)],
  );
  return getSubscription(userId, scope);
}
async function resolveSubscription(token) {
  if (!/^[a-f0-9]{64}$/.test(token || '')) return null;
  const [rows] = await db.query(
    `SELECT s.token_encrypted,s.user_id,s.scope_key,r.id AS room_id FROM electricity_rss_subscriptions s
 JOIN users u ON u.id=s.user_id JOIN electricity_rooms r ON r.scope_key=s.scope_key
 WHERE s.token_hash=? AND u.status<>'disabled' AND r.active=1 AND
 (u.role='owner' OR (r.legacy=0 AND EXISTS(SELECT 1 FROM electricity_room_members m WHERE m.room_id=r.id AND m.user_id=u.id))) LIMIT 1`,
    [hash(token)],
  );
  if (!rows[0]) return null;
  try {
    return unseal(
      rows[0].token_encrypted,
      `${rows[0].user_id}:${rows[0].scope_key}`,
    ) === token
      ? rows[0]
      : null;
  } catch {
    return null;
  }
}
async function authorizedScope(token, scope) {
  const result = await resolveSubscription(token);
  return Boolean(result && result.scope_key === scope);
}
module.exports = {
  getReport,
  saveReport,
  listReports,
  getSubscription,
  createSubscription,
  authorizedScope,
  resolveSubscription,
};

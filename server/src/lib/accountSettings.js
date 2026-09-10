const crypto = require('crypto');
const db = require('../db');
const { getAuthTokenFromRequest } = require('../middleware/auth');
const { sendMail } = require('./mailer');
const { siteOrigin } = require('./socialConfig');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const emailValid = value => typeof value === 'string' && value.length <= 120 && /^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(value) && !value.endsWith('.invalid');
const sessionHash = req => hash(getAuthTokenFromRequest(req) || '');
function fail(message, status = 400) { return Object.assign(new Error(message), { status }); }
async function profile(connection, id, lock = false) {
  const [rows] = await connection.query(`SELECT u.id,u.username,u.email,u.role,u.status,u.can_comment,u.created_at,p.avatar_url,p.deleted_at,COALESCE(p.version,0) AS version FROM users u LEFT JOIN account_profiles p ON p.user_id=u.id WHERE u.id=?${lock ? ' FOR UPDATE' : ''}`, [id]);
  if (!rows[0]) throw fail('用户不存在。', 404);
  return rows[0];
}
function canManage(actor, target) {
  return actor.role === 'owner' || (actor.role === 'admin' && !['owner', 'admin'].includes(target.role));
}
async function invalidate(connection, id) {
  await connection.query('INSERT INTO auth_invalidations(user_id,invalid_before) VALUES (?,?) ON DUPLICATE KEY UPDATE invalid_before=GREATEST(invalid_before,VALUES(invalid_before))', [id, Date.now()]);
  await connection.query('DELETE FROM password_resets WHERE user_id=?', [id]);
  await connection.query('DELETE FROM account_challenges WHERE user_id=?', [id]);
}
async function sendReset(user) {
  if (user.deleted_at || user.status !== 'active' || !emailValid(user.email)) throw fail('该账号不能接收密码重置邮件。');
  const token = crypto.randomBytes(32).toString('hex');
  const c = await db.getConnection();
  try {
    await c.beginTransaction();
    const current = await profile(c, user.id, true);
    if (current.email !== user.email || current.deleted_at || current.status !== 'active') throw fail('账号资料已变化，请刷新后重试。', 409);
    await c.query('INSERT INTO password_resets(user_id,token_hash,expires_at) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 30 MINUTE))', [user.id, hash(token)]);
    await c.commit();
  } catch (error) { await c.rollback(); throw error; } finally { c.release(); }
  try {
    const sent = await sendMail({ to: user.email, subject: '[mooncci] 重置账户密码', text: `请通过此链接设置账户密码，30 分钟内有效：\n${siteOrigin()}/reset-password?token=${token}\n如果不是你本人操作，可以忽略此邮件。` });
    if (!sent.sent) throw new Error();
  } catch { await db.query('DELETE FROM password_resets WHERE token_hash=?', [hash(token)]); throw fail('邮件发送失败，请稍后重试。', 503); }
}
async function consumeChallenge(connection, req, purpose, input) {
  if (typeof input.challenge_id !== 'string' || !/^[a-f0-9]{64}$/.test(input.challenge_id)) throw fail('请先发送验证码。');
  const [rows] = await connection.query('SELECT * FROM account_challenges WHERE id=? AND user_id=? AND session_hash=? AND purpose=? FOR UPDATE', [input.challenge_id, req.user.id, sessionHash(req), purpose]);
  const item = rows[0];
  if (!item || item.expires_at <= Date.now() || item.attempts >= 5 || item.old_email !== req.user.email) throw fail('验证已过期，请重新发送。');
  if ((purpose === 'social' && hash(`${item.id}:${input.old_code}`) !== item.old_code_hash) || (purpose === 'email' && hash(`${item.id}:${input.new_code}`) !== item.new_code_hash)) {
    await connection.query('UPDATE account_challenges SET attempts=attempts+1 WHERE id=?', [item.id]);
    // Persist failed attempts while the caller retains ownership of transaction cleanup.
    await connection.commit();
    throw fail('验证码不正确。');
  }
  await connection.query('DELETE FROM account_challenges WHERE id=?', [item.id]);
  return item;
}
async function changeEmail(c, user, email) {
  if (!emailValid(email) || email === user.email || user.deleted_at) throw fail('新邮箱无效或与当前邮箱相同。');
  await c.query('UPDATE users SET email=? WHERE id=?',[email,user.id]);
  await c.query('INSERT INTO account_profiles(user_id) VALUES (?) ON DUPLICATE KEY UPDATE version=version+1',[user.id]);
  await invalidate(c,user.id);
  return {...user,email};
}
module.exports = { profile, canManage, invalidate, sendReset, consumeChallenge, emailValid, fail, hash, sessionHash, changeEmail };

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const db = require('../db');
const { authRequired, adminOnly, getUserFromRequest } = require('../middleware/auth');
const settings = require('../lib/accountSettings');
const { profile, canManage, invalidate, sendReset, fail } = settings;
const router = require('../lib/asyncRouter')();
const rateLimit = require('express-rate-limit');
const readLimit = rateLimit({ windowMs: 60000, limit: 120, standardHeaders: true, legacyHeaders: false });
const writeLimit = rateLimit({ windowMs: 60000, limit: 20, standardHeaders: true, legacyHeaders: false });
const mailLimit = rateLimit({ windowMs: 3600000, limit: 8, standardHeaders: true, legacyHeaders: false });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } }).single('avatar');
const avatarDir = path.join(__dirname, '../../uploads/avatars');
const handler = fn => async (req, res, next) => {
  try { await fn(req, res); } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: '用户名或邮箱已被使用。' });
    if (error.status) return res.status(error.status).json({ message: error.message });
    next(error);
  }
};
const targetId = req => req.params.id ? Number(req.params.id) : req.user.id;
async function target(connection, req, lock = false) {
  const id = targetId(req);
  if (!Number.isSafeInteger(id) || id <= 0) throw fail('用户编号无效。');
  const actor = await profile(connection, req.user.id, lock);
  if (lock && !await getUserFromRequest(req)) throw fail('登录状态已失效，请重新登录。', 401);
  const user = id === actor.id ? actor : await profile(connection, id, lock);
  if (actor.status !== 'active' || actor.deleted_at) throw fail('登录状态已失效。', 401);
  if (req.params.id && !canManage(actor, user)) throw fail('没有修改此账号的权限。', 403);
  return user;
}
async function transaction(fn) {
  const c = await db.getConnection();
  try { await c.beginTransaction(); const result = await fn(c); await c.commit(); return result; }
  catch (error) { await c.rollback(); throw error; }
  finally { c.release(); }
}
async function read(req, res) {
  const user = await target(db, req);
  if (user.deleted_at) user.email = '';
  res.json({ user });
}
async function save(req, res) {
  const username = String(req.body.username || '').trim();
  if (!username || Array.from(username).length > 40 || /[\x00-\x1f\x7f]/.test(username)) throw fail('用户名请填写 1–40 个字符。');
  await transaction(async c => {
    const user = await target(c, req, true);
    if (user.deleted_at) throw fail('已删除的账号不能修改。');
    if (req.body.version !== user.version) throw fail('资料已更新，请刷新后重试。', 409);
    await c.query('UPDATE users SET username=? WHERE id=?', [username, user.id]);
    await c.query('INSERT INTO account_profiles(user_id) VALUES (?) ON DUPLICATE KEY UPDATE version=version+1', [user.id]);
  });
  res.json({ user: await profile(db, targetId(req)), message: '资料已保存。' });
}
async function avatar(req, res) {
  await target(db, req);
  if (!req.file) throw fail('请选择 JPG、PNG 或 WebP 图片，最大 2 MB。');
  let data;
  try {
    const image = sharp(req.file.buffer, { limitInputPixels: 16000000, animated: false });
    const info = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(info.format)) throw new Error();
    data = await image.rotate().resize(256, 256, { fit: 'cover' }).webp({ quality: 85 }).toBuffer();
  } catch { throw fail('图片无法读取，请使用 JPG、PNG 或 WebP 图片。'); }
  await fs.mkdir(avatarDir, { recursive: true });
  const name = `${crypto.randomUUID()}.webp`;
  await fs.writeFile(path.join(avatarDir, name), data, { flag: 'wx' });
  try {
    await transaction(async c => {
      const user = await target(c, req, true);
      if (user.deleted_at) throw fail('已删除的账号不能修改。');
      await c.query('INSERT INTO account_profiles(user_id,avatar_url) VALUES (?,?) ON DUPLICATE KEY UPDATE avatar_url=VALUES(avatar_url),version=version+1', [user.id, `/api/uploads/avatars/${name}`]);
    });
  } catch (error) { await fs.unlink(path.join(avatarDir, name)); throw error; }
  res.json({ user: await profile(db, targetId(req)), message: '头像已更新。' });
}
async function reset(req, res) { await sendReset(await target(db, req)); res.json({ message: '密码重置链接已发送到登录邮箱，30 分钟内有效。' }); }
router.get('/account', readLimit, authRequired, handler(read));
router.put('/account', writeLimit, authRequired, handler(save));
router.post('/account/avatar', writeLimit, authRequired, upload, handler(avatar));
router.post('/account/password-reset', mailLimit, authRequired, handler(reset));
router.post('/account/email-code', mailLimit, authRequired, handler(async(req,res)=>{
  const email=String(req.body.email||'').trim().toLowerCase();
  if(!settings.emailValid(email)||email===req.user.email) throw fail('请填写不同的有效新邮箱。');
  const id=crypto.randomBytes(32).toString('hex'),code=crypto.randomInt(100000,1000000).toString();
  await transaction(async c=>{
    await target(c,req,true);
    const [recent]=await c.query('SELECT id FROM account_challenges WHERE user_id=? AND created_at>?',[req.user.id,Date.now()-60000]);
    if(recent.length)throw fail('请间隔 60 秒再发送。',429);
    const [existing]=await c.query('SELECT id FROM users WHERE email=?',[email]);
    if(existing.length)throw fail('该邮箱已被使用。',409);
    await c.query('DELETE FROM account_challenges WHERE user_id=? AND purpose="email"',[req.user.id]);
    await c.query('INSERT INTO account_challenges(id,user_id,session_hash,purpose,old_email,new_email,old_code_hash,new_code_hash,created_at,expires_at) VALUES (?,?,?,"email",?,?,"",?,?,?)',[id,req.user.id,settings.sessionHash(req),req.user.email,email,settings.hash(`${id}:${code}`),Date.now(),Date.now()+600000]);
  });
  try{
    const r=await require('../lib/mailer').sendMail({to:email,subject:'[mooncci] 验证新登录邮箱',text:`验证码：${code}，10 分钟内有效。验证后还需输入当前密码或重新授权已绑定的第三方账号，才能完成邮箱换绑。`});
    if(!r.sent)throw new Error();
  }catch{await db.query('UPDATE account_challenges SET expires_at=0 WHERE id=?',[id]);throw fail('验证码发送失败，请稍后重试。',503);}
  res.json({challenge_id:id,message:'验证码已发送到新邮箱。'});
}));
router.post('/account/email', writeLimit, authRequired, handler(async(req,res)=>{
  const password=req.body.password;
  if(typeof password!=='string'||password.length>200)throw fail('请输入当前密码。');
  const updated=await transaction(async c=>{
    const user=await target(c,req,true);
    const [[row]]=await c.query('SELECT password_hash FROM users WHERE id=?',[user.id]);
    if(!await require('bcryptjs').compare(password,row.password_hash))throw fail('当前密码不正确。');
    const challenge=await settings.consumeChallenge(c,req,'email',req.body);
    return settings.changeEmail(c,user,challenge.new_email);
  });
  const {setAuthCookie,signToken}=require('../lib/authSession');
  setAuthCookie(req,res,signToken(updated,Date.now()+1));
  res.json({user:await profile(db,req.user.id),message:'登录邮箱已更新，其他旧会话已失效。'});
}));
router.post('/account/security-code', mailLimit, authRequired, handler(async (req, res) => {
  const user = await profile(db, req.user.id);
  if (!settings.emailValid(user.email) || user.deleted_at) throw fail('请先设置可用的登录邮箱。');
  const id = crypto.randomBytes(32).toString('hex'), code = crypto.randomInt(100000, 1000000).toString();
  await transaction(async c => {
    await target(c, req, true);
    const [recent] = await c.query('SELECT id FROM account_challenges WHERE user_id=? AND created_at>?', [user.id, Date.now()-60000]);
    if (recent.length) throw fail('请间隔 60 秒再发送。', 429);
    await c.query('DELETE FROM account_challenges WHERE user_id=? AND purpose="social"', [user.id]);
    await c.query('INSERT INTO account_challenges(id,user_id,session_hash,purpose,old_email,old_code_hash,created_at,expires_at) VALUES (?,?,?,"social",?,?,?,?)', [id,user.id,settings.sessionHash(req),user.email,settings.hash(`${id}:${code}`),Date.now(),Date.now()+600000]);
  });
  try {
    const result = await require('../lib/mailer').sendMail({to:user.email,subject:'[mooncci] 确认第三方账号变更',text:`验证码：${code}，10 分钟内有效。用于更换或解除第三方登录绑定，请勿转发。`});
    if (!result.sent) throw new Error();
  } catch { await db.query('UPDATE account_challenges SET expires_at=0 WHERE id=?',[id]); throw fail('验证码发送失败，请稍后重试。',503); }
  res.json({challenge_id:id,message:'验证码已发送到当前登录邮箱，10 分钟内有效。'});
}));
router.delete('/account/connections/:provider', writeLimit, authRequired, handler(async (req,res)=>{
  const provider=req.params.provider;
  if (!require('../lib/socialConfig').validProvider(provider)) throw fail('未知登录方式。');
  await transaction(async c=>{
    await target(c,req,true);
    await settings.consumeChallenge(c,req,'social',req.body);
    if (provider==='google') await c.query('UPDATE users SET google_sub=NULL WHERE id=?',[req.user.id]);
    else await c.query('DELETE FROM oauth_identities WHERE provider=? AND user_id=?',[provider,req.user.id]);
    await c.query('DELETE FROM oauth_states WHERE user_id=? AND provider=?',[req.user.id,provider]);
  });
  res.json({message:'已解除绑定。仍可使用登录邮箱登录或重置密码。'});
}));
router.get('/admin/users/:id/settings', readLimit, authRequired, adminOnly, handler(read));
router.put('/admin/users/:id/settings', writeLimit, authRequired, adminOnly, handler(save));
router.post('/admin/users/:id/avatar', writeLimit, authRequired, adminOnly, upload, handler(avatar));
router.post('/admin/users/:id/password-reset', mailLimit, authRequired, adminOnly, handler(reset));
router.put('/admin/users/:id/email', writeLimit, authRequired, adminOnly, handler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!settings.emailValid(email)) throw fail('请填写有效的登录邮箱。');
  if (targetId(req) === req.user.id) throw fail('修改自己的邮箱请使用个人设置中的邮箱验证流程。');
  await transaction(async c => {
    const user = await target(c, req, true);
    if (user.deleted_at) throw fail('已删除的账号不能修改。');
    if (req.body.version !== user.version) throw fail('资料已更新，请刷新后重试。', 409);
    await c.query('UPDATE users SET email=? WHERE id=?', [email, user.id]);
    await c.query('INSERT INTO account_profiles(user_id) VALUES (?) ON DUPLICATE KEY UPDATE version=version+1', [user.id]);
    await invalidate(c, user.id);
  });
  res.json({ user: await profile(db, targetId(req)), message: '登录邮箱已设置，原登录会话和密码重置链接已失效。' });
}));
router.delete('/admin/users/:id/account', writeLimit, authRequired, adminOnly, handler(async (req, res) => {
  await transaction(async c => {
    const user = await target(c, req, true);
    if (user.id === req.user.id || user.role === 'owner') throw fail('不能删除当前账号或站长账号，请先转移站长权限。');
    if (user.deleted_at) throw fail('此账号已删除。');
    if (req.body.username !== user.username) throw fail('请准确输入该用户的用户名以确认删除。');
    await c.query('INSERT INTO account_profiles(user_id,deleted_at) VALUES (?,NOW()) ON DUPLICATE KEY UPDATE deleted_at=NOW(),version=version+1', [user.id]);
    await c.query('UPDATE users SET email=?,google_sub=NULL,password_hash=?,status="disabled",can_comment=0 WHERE id=?', [`deleted-${user.id}-${crypto.randomBytes(8).toString('hex')}@account.invalid`, await require('bcryptjs').hash(crypto.randomBytes(32).toString('hex'), 10), user.id]);
    await c.query('DELETE FROM oauth_identities WHERE user_id=?', [user.id]);
    await c.query('DELETE FROM oauth_states WHERE user_id=?', [user.id]);
    await invalidate(c, user.id);
  });
  res.json({ message: '账号已删除，文章、评论、用户名和头像已保留，并显示已删除标记。' });
}));
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) return res.status(400).json({ message: '请上传一张不超过 2 MB 的头像图片。' });
  next(error);
});
module.exports = router;

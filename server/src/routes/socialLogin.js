const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { authRequired, ownerOnly, getUserFromRequest, getAuthTokenFromRequest } = require('../middleware/auth');
const { authCookieOptions, setAuthCookie, signToken } = require('../lib/authSession');
const configStore = require('../lib/socialConfig');
const { PROVIDERS, validProvider, sha256, encrypt, decrypt, ready, publicConfig, getConfig } = configStore;
const adapters = require('../lib/socialProviders');
const { verifyGoogleCredential } = require('../lib/googleIdentity');
const mailer = require('../lib/mailer');
const router = require('../lib/asyncRouter')();
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.vary('Cookie'); next();
});
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { message: '登录请求过于频繁，请稍后重试。' } });
function cookieOptions(req) { return { ...authCookieOptions(req), domain: undefined, path: '/api/auth', maxAge: 10 * 60 * 1000 }; }
const cookieName = provider => `mooncci_oauth_${provider}`;
function readCookie(req, name) {
  const part = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`));
  return part ? part.slice(name.length + 1) : '';
}
function returnTo(value) {
  return typeof value === 'string' && /^\/electricity(?:\?roomId=[a-f0-9-]{36})?$/.test(value) ? value : '/';
}
const validEmail = value => typeof value === 'string' && value.length <= 120 && /^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(value) && !value.endsWith('.invalid');
const pendingCookie = 'mooncci_registration';
async function createPending(req, res, provider, config, identity, state) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  await db.query('DELETE FROM oauth_registrations WHERE expires_at<? LIMIT 100', [now]);
  await db.query('INSERT INTO oauth_registrations (token_hash,provider,client_id,config_version,subject,display_name,started_at,expires_at,return_to) VALUES (?,?,?,?,?,?,?,?,?)',
    [sha256(token), provider, config.client_id, config.version, identity.subject, Array.from(identity.name).slice(0, 80).join(''), state.started_at, now + 1800000, returnTo(state.return_to)]);
  res.cookie(pendingCookie, token, { ...cookieOptions(req), maxAge: 1800000 });
}
function pendingHash(req) {
  const token = readCookie(req, pendingCookie);
  return /^[a-f0-9]{64}$/.test(token) ? sha256(token) : '';
}
router.get('/registration', async (req, res) => {
  const [rows] = await db.query('SELECT provider FROM oauth_registrations WHERE token_hash=? AND expires_at>?', [pendingHash(req), Date.now()]);
  if (!rows[0]) return res.status(401).json({ message: '注册授权已过期，请重新选择第三方登录。' });
  res.json({ provider: PROVIDERS[rows[0].provider] });
});
const emailLimiter = rateLimit({ windowMs: 3600000, limit: 5, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => sha256(String(req.body.email || '').trim().toLowerCase()), message: { message: '该邮箱请求过于频繁，请稍后重试。' } });
router.post('/registration/email', limiter, emailLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!validEmail(email)) return res.status(400).json({ message: '请填写有效邮箱，最多 120 个字符。' });
  const hash = pendingHash(req);
  const now = Date.now();
  const code = crypto.randomInt(100000, 1000000).toString();
  const codeHash = sha256(`${hash}:${code}`);
  const [result] = await db.query('UPDATE oauth_registrations SET email=?,code_hash=?,code_expires_at=?,sent_at=?,attempts=0 WHERE token_hash=? AND expires_at>? AND sent_at<?', [email, codeHash, now + 600000, now, hash, now, now - 60000]);
  if (!result.affectedRows) return res.status(429).json({ message: '请间隔 60 秒再发送；授权过期时需重新登录。' });
  try {
    const sent = await mailer.sendMail({ to: email, subject: '验证邮箱，完成注册', text: `你的邮箱验证码是 ${code}，10 分钟内有效。请在 mooncci 网站输入，完成第三方账号注册。如果不是你本人操作，请忽略此邮件。` });
    if (!sent.sent) throw new Error('mail_unavailable');
    res.json({ message: '验证码已发送，10 分钟内有效。' });
  } catch {
    await db.query("UPDATE oauth_registrations SET code_hash='',code_expires_at=0 WHERE token_hash=? AND code_hash=?", [hash, codeHash]);
    res.status(503).json({ message: '验证码暂时无法发送，请稍后重试或联系站长。' });
  }
});
router.post('/registration/complete', limiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const code = req.body.code;
  if (!validEmail(email) || typeof code !== 'string' || !/^\d{6}$/.test(code)) return res.status(400).json({ message: '请填写邮箱和 6 位验证码。' });
  const hash = pendingHash(req);
  const connection = await db.getConnection();
  let pending;
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT * FROM oauth_registrations WHERE token_hash=? AND expires_at>? FOR UPDATE', [hash, Date.now()]);
    pending = rows[0];
    if (!pending || pending.attempts >= 5 || pending.code_expires_at < Date.now()) {
      await connection.rollback(); return res.status(400).json({ message: '验证码已过期或尝试过多，请重新发送。' });
    }
    if (pending.email !== email || pending.code_hash !== sha256(`${hash}:${code}`)) {
      await connection.query('UPDATE oauth_registrations SET attempts=attempts+1 WHERE token_hash=?', [hash]);
      await connection.commit(); return res.status(400).json({ message: '邮箱或验证码不正确。' });
    }
    // Consumed atomically before account creation: a captured code cannot be replayed.
    await connection.query('DELETE FROM oauth_registrations WHERE token_hash=?', [hash]);
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
  try {
    const config = await getConfig(pending.provider);
    if (!ready(config) || config.version !== pending.config_version || config.client_id !== pending.client_id) throw new Error('config_changed');
    const user = await finishIdentity(pending.provider, config, { subject: pending.subject, name: pending.display_name, email, emailVerified: true }, pending);
    setAuthCookie(req, res, signToken(user, Number(pending.started_at)));
    res.clearCookie(pendingCookie, { ...cookieOptions(req), maxAge: undefined });
    res.json({ redirect: returnTo(pending.return_to), message: '邮箱验证成功，注册完成。' });
  } catch (error) {
    res.status(409).json({ message: error.message === 'email_exists' ? '该邮箱已有账号，请用原方式登录，再到账号绑定页绑定。' : '注册未完成，请重新选择第三方登录。' });
  }
});

router.post('/google', limiter, async (req, res) => {
  const started_at = Date.now();
  try {
    const config = await getConfig('google');
    if (!ready(config)) return res.status(403).json({ message: 'Google 登录尚未启用。' });
    const payload = await verifyGoogleCredential(req.body.credential, config.client_id);
    const email = String(payload.email).toLowerCase();
    const identity = { subject: String(payload.sub), name: String(payload.name || 'Google 用户'), email, emailVerified: payload.email_verified === true && (email.endsWith('@gmail.com') || Boolean(payload.hd)) };
    const state = { started_at, return_to: '/' };
    const user = await finishIdentity('google', config, identity, state);
    if (!user) {
      await createPending(req, res, 'google', config, identity, state);
      return res.json({ registration_required: true });
    }
    setAuthCookie(req, res, signToken(user, started_at));
    const { publicUser } = require('../lib/authSession');
    res.json({ user: publicUser(user), message: 'Google 登录成功。' });
  } catch (error) {
    res.status(401).json({ message: error.message === 'email_exists' ? '该邮箱已有账号，请先用原方式登录，再到账号绑定页绑定 Google。' : 'Google 登录未完成，请检查账号状态后重试。' });
  }
});

router.get('/providers', async (_req, res) => {
  const configs = await Promise.all(Object.keys(PROVIDERS).map(p => getConfig(p)));
  res.json({ providers: configs.filter(ready).map(c => ({ provider: c.provider, name: PROVIDERS[c.provider], ...(c.provider === 'google' ? { client_id: c.client_id } : {}) })) });
});
router.get('/providers/manage', authRequired, ownerOnly, async (_req, res) => {
  res.json({ providers: await Promise.all(Object.keys(PROVIDERS).map(async p => publicConfig(await getConfig(p)))) });
});
router.put('/providers/manage/:provider', authRequired, ownerOnly, async (req, res) => {
  const provider = req.params.provider;
  if (!validProvider(provider)) return res.status(404).json({ message: '未知登录渠道。' });
  const { enabled, client_id, client_secret, clear_secret, version } = req.body;
  if (typeof enabled !== 'boolean' || typeof client_id !== 'string' || !/^[A-Za-z0-9._-]{0,255}$/.test(client_id) ||
    (client_secret !== undefined && (typeof client_secret !== 'string' || client_secret.length > 2048 || /[\s\x00-\x1f]/.test(client_secret))) ||
    (clear_secret !== undefined && typeof clear_secret !== 'boolean') || !Number.isInteger(version)) {
    return res.status(400).json({ message: '请检查应用 ID、密钥和开关格式。' });
  }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const old = await getConfig(provider, connection, true);
    if (old.version !== version) { await connection.rollback(); return res.status(409).json({ message: '配置已被其他页面修改，请刷新后再保存。' }); }
    if (client_id !== old.client_id && old.enabled && enabled) { await connection.rollback(); return res.status(400).json({ message: '更换应用 ID 前请先停用该渠道。' }); }
    let secret = clear_secret || client_id !== old.client_id ? '' : old.secret_cipher;
    if (client_secret) secret = encrypt(client_secret, provider);
    if (enabled && (!client_id || (provider !== 'google' && !secret))) { await connection.rollback(); return res.status(400).json({ message: '填写完整应用 ID 和密钥后才能启用。' }); }
    // An upsert with a guarded version prevents concurrent first-save overwrites as well.
    if (old.version) {
      await connection.query('UPDATE oauth_providers SET enabled=?,client_id=?,secret_cipher=?,version=version+1 WHERE provider=?', [enabled ? 1 : 0, client_id, secret, provider]);
    } else {
      await connection.query('INSERT INTO oauth_providers (provider,enabled,client_id,secret_cipher) VALUES (?,?,?,?)', [provider, enabled ? 1 : 0, client_id, secret]);
    }
    await connection.commit();
    res.json({ message: '登录设置已保存。', provider: publicConfig(await getConfig(provider)) });
  } catch (error) {
    await connection.rollback();
    if (['ER_DUP_ENTRY', 'ER_LOCK_DEADLOCK'].includes(error.code)) return res.status(409).json({ message: '配置发生冲突，请刷新后重试。' });
    throw error;
  } finally { connection.release(); }
});

router.get('/connections', authRequired, async (req, res) => {
  const [identities] = await db.query('SELECT provider,client_id FROM oauth_identities WHERE user_id=?', [req.user.id]);
  const [users] = await db.query('SELECT google_sub FROM users WHERE id=?', [req.user.id]);
  const configs = await Promise.all(Object.keys(PROVIDERS).map(p => getConfig(p)));
  res.json({ providers: configs.map(c => ({ provider: c.provider, name: PROVIDERS[c.provider], enabled: ready(c), bound: c.provider === 'google' ? Boolean(users[0]?.google_sub) : identities.some(i => i.provider === c.provider && i.client_id === c.client_id), ...(c.provider === 'google' && ready(c) ? { client_id: c.client_id } : {}) })) });
});

router.post('/google/bind', limiter, authRequired, async (req, res) => {
  const config = await getConfig('google');
  if (!ready(config)) return res.status(403).json({ message: 'Google 登录尚未启用。' });
  let identity;
  try { identity = await verifyGoogleCredential(req.body.credential, config.client_id); }
  catch { return res.status(400).json({ message: 'Google 凭证无效，请重试。' }); }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const currentUser = await getUserFromRequest(req);
    if (!currentUser || currentUser.id !== req.user.id || currentUser.status === 'disabled') throw new Error('session_expired');
    const currentConfig = await getConfig('google', connection, true);
    if (!ready(currentConfig) || currentConfig.version !== config.version) throw new Error('config_changed');
    const [rows] = await connection.query('SELECT status,google_sub FROM users WHERE id=? FOR UPDATE', [req.user.id]);
    if (!rows[0] || rows[0].status === 'disabled') throw new Error('disabled');
    if (rows[0].google_sub && rows[0].google_sub !== identity.sub) throw new Error('already_bound');
    await connection.query('UPDATE users SET google_sub=? WHERE id=?', [identity.sub, req.user.id]);
    await connection.commit(); res.json({ message: 'Google 账号已绑定。' });
  } catch {
    await connection.rollback(); res.status(409).json({ message: '绑定失败：账号可能已绑定，或配置已变更。请刷新重试。' });
  } finally { connection.release(); }
});

router.post('/:provider/start', limiter, async (req, res) => {
  const provider = req.params.provider;
  if (!validProvider(provider) || provider === 'google') return res.status(404).json({ message: '未知登录渠道。' });
  const config = await getConfig(provider);
  if (!ready(config)) return res.status(403).json({ message: '该登录渠道尚未启用。' });
  const binding = req.body.mode === 'bind';
  let user = null;
  if (binding) {
    try { user = await getUserFromRequest(req); } catch { /* require a valid current session */ }
    if (!user || user.status === 'disabled') return res.status(401).json({ message: '请重新登录后绑定。' });
  }
  const state = crypto.randomBytes(32).toString('hex');
  const browser = crypto.randomBytes(32).toString('hex');
  const verifier = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  await db.query('DELETE FROM oauth_states WHERE expires_at<? LIMIT 100', [now]);
  await db.query(`INSERT INTO oauth_states (state_hash,browser_hash,provider,config_version,client_id,verifier,user_id,session_hash,started_at,expires_at,return_to) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [sha256(state), sha256(browser), provider, config.version, config.client_id, verifier, user?.id || null, binding ? sha256(getAuthTokenFromRequest(req)) : null, now, now + 600000, binding ? '/account/connections' : returnTo(req.body.return_to)]);
  res.cookie(cookieName(provider), browser, cookieOptions(req));
  res.json({ url: adapters.authorizationUrl(provider, config, state, verifier) });
});

async function finishIdentity(provider, config, identity, state) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const current = await getConfig(provider, connection, true);
    if (!ready(current) || current.version !== config.version || current.client_id !== config.client_id) throw new Error('config_changed');
    const [identities] = await connection.query('SELECT user_id FROM oauth_identities WHERE provider=? AND client_id=? AND subject=?', [provider, config.client_id, identity.subject]);
    let existing = identities[0];
    if (provider === 'google') {
      const [googleUsers] = await connection.query('SELECT id AS user_id FROM users WHERE google_sub=?', [identity.subject]);
      existing = googleUsers[0];
    }
    if (state.user_id && existing && existing.user_id !== state.user_id) throw new Error('already_bound');
    let userId = state.user_id || existing?.user_id;
    if (!userId) {
      if (!identity.emailVerified || !validEmail(identity.email)) { await connection.rollback(); return null; }
      const [emails] = await connection.query('SELECT id FROM users WHERE email=?', [identity.email]);
      if (emails.length) throw new Error('email_exists');
      const suffix = crypto.randomBytes(6).toString('hex');
      const username = `${Array.from(identity.name.replace(/[\x00-\x1f]/g, '').trim()).slice(0, 16).join('') || PROVIDERS[provider]}_${suffix}`;
      const password = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
      const [created] = await connection.query("INSERT INTO users (username,email,password_hash,role,status,can_comment) VALUES (?,?,?,'user','active',1)", [username, identity.email, password]);
      userId = created.insertId;
    }
    const [users] = await connection.query('SELECT id,username,email,role,status,can_comment FROM users WHERE id=? FOR UPDATE', [userId]);
    if (!users[0] || users[0].status === 'disabled') throw new Error('disabled');
    if (state.user_id) {
      const [revoked] = await connection.query('SELECT token_hash FROM auth_revocations WHERE token_hash=?', [state.session_hash]);
      const [invalidated] = await connection.query('SELECT user_id FROM auth_invalidations WHERE user_id=? AND invalid_before>=?', [userId, state.started_at]);
      if (revoked.length || invalidated.length) throw new Error('session_expired');
    }
    if (!existing) {
      if (provider === 'google') await connection.query('UPDATE users SET google_sub=? WHERE id=?', [identity.subject, userId]);
      else await connection.query('INSERT INTO oauth_identities (provider,client_id,subject,user_id) VALUES (?,?,?,?)', [provider, config.client_id, identity.subject, userId]);
    }
    await connection.commit(); return users[0];
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
router.get('/:provider/callback', limiter, async (req, res) => {
  const provider = req.params.provider;
  if (!validProvider(provider) || provider === 'google') return res.status(404).end();
  let state;
  try {
    const inputState = req.query.state;
    const browser = readCookie(req, cookieName(provider));
    if (typeof inputState !== 'string' || !/^[a-f0-9]{64}$/.test(inputState) || !/^[a-f0-9]{64}$/.test(browser)) throw new Error('state_invalid');
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query('SELECT * FROM oauth_states WHERE state_hash=? AND browser_hash=? AND provider=? AND expires_at>? FOR UPDATE', [sha256(inputState), sha256(browser), provider, Date.now()]);
      if (!rows[0]) throw new Error('state_expired');
      state = rows[0];
      await connection.query('DELETE FROM oauth_states WHERE state_hash=?', [sha256(inputState)]);
      await connection.commit();
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
    res.clearCookie(cookieName(provider), { ...cookieOptions(req), maxAge: undefined });
    if (req.query.error || typeof req.query.code !== 'string' || !req.query.code || req.query.code.length > 2048) throw new Error('authorization_denied');
    if (state.user_id) {
      const user = await getUserFromRequest(req);
      if (!user || user.status === 'disabled' || user.id !== state.user_id || sha256(getAuthTokenFromRequest(req) || '') !== state.session_hash) throw new Error('session_expired');
    }
    const config = await getConfig(provider);
    if (!ready(config) || config.version !== state.config_version || config.client_id !== state.client_id) throw new Error('config_changed');
    const identity = await adapters.exchange(provider, config, decrypt(config.secret_cipher, provider), req.query.code, state.verifier);
    const user = await finishIdentity(provider, config, identity, state);
    if (!user) {
      await createPending(req, res, provider, config, identity, state);
      return res.redirect(303, '/complete-registration');
    }
    if (!state.user_id) setAuthCookie(req, res, signToken(user, Number(state.started_at)));
    const target = state.user_id ? '/account/connections?oauth=bound' : state.return_to !== '/' ? state.return_to : ['owner', 'admin', 'editor'].includes(user.role) ? '/admin' : '/';
    res.redirect(303, target);
  } catch (error) {
    // Never log authorization codes, secrets, upstream URLs or access tokens.
    res.redirect(303, state?.user_id ? '/account/connections?oauth=failed' : error.message === 'email_exists' ? '/login?oauth=email_exists' : '/login?oauth=failed');
  }
});
module.exports = router;

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { authRequired, getAuthTokenFromRequest } = require('../middleware/auth');
const { sendMail, getMailConfig } = require('../lib/mailer');
const { renderBrandedEmail } = require('../lib/mailTemplate');

const router = require('../lib/asyncRouter')();
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.vary('Cookie');
  res.vary('Authorization');
  next();
});

function authRateLimit({ name, windowMs, max, includeEmail = false }) {
  return rateLimit({
    windowMs, limit: max, standardHeaders: true, legacyHeaders: false,
    keyGenerator: req => `${name}:${rateLimit.ipKeyGenerator(req.ip)}:${includeEmail ? sha256(String(req.body?.email || '').trim().toLowerCase()) : ''}`,
    message: { message: '请求过于频繁，请稍后再试。' },
  });
}


const GENERIC_RESET_MESSAGE = '如果该邮箱存在，重置密码邮件将会发送。';
const PASSWORD_RULE_MESSAGE = '密码至少 8 位，并且需要同时包含字母和数字。';
const MAX_LOGIN_FAILURES = 5;
const LOGIN_LOCK_MINUTES = 15;
const { signToken, publicUser, setAuthCookie, clearAuthCookie } = require('../lib/authSession');

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function validatePassword(password) {
  if (Buffer.byteLength(password, 'utf8') > 72) return '密码不能超过 72 字节。';
  if (password.length < 8) return PASSWORD_RULE_MESSAGE;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return PASSWORD_RULE_MESSAGE;
  return '';
}

function isLockedUntilFuture(value) {
  if (!value) return false;
  return new Date(value).getTime() > Date.now();
}

function safeSiteUrl(value) {
  const fallback = 'https://mooncci.site';
  const input = String(value || fallback).trim();

  try {
    const parsed = new URL(input);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.origin : fallback;
  } catch {
    return fallback;
  }
}

router.post('/register', authRateLimit({ name: 'register', windowMs: 60 * 60 * 1000, max: 8 }), async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!username || !email || !password) {
      return res.status(400).json({ message: '请填写用户名、邮箱和密码。' });
    }

    if (username.length < 2 || username.length > 30) {
      return res.status(400).json({ message: '用户名长度需要在 2 到 30 个字符之间。' });
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: '请填写有效的邮箱地址。' });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const [sameUsername] = await db.query('SELECT id FROM users WHERE username=? LIMIT 1', [username]);
    if (sameUsername[0]) {
      return res.status(409).json({ message: '用户名已被占用。' });
    }

    const [sameEmail] = await db.query('SELECT id FROM users WHERE email=? LIMIT 1', [email]);
    if (sameEmail[0]) {
      return res.status(409).json({ message: '该邮箱已注册。' });
    }


    const passwordHash = await bcrypt.hash(password, 10);

    await db.query(
      `
      INSERT INTO users
      (username, email, password_hash, role, status, can_comment)
      VALUES (?, ?, ?, 'user', 'active', 1)
      `,
      [username, email, passwordHash]
    );

    res.json({ message: 'Registered successfully.' });
  } catch (err) {
    console.error('[auth/register]', err);

    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: '用户名或邮箱已存在。' });
    }

    res.status(500).json({ message: '注册失败，请稍后再试。' });
  }
});

router.post('/login', authRateLimit({ name: 'login', windowMs: 15 * 60 * 1000, max: 10, includeEmail: true }), async (req, res) => {
  const sessionStartedAt = Date.now();
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ message: '请填写邮箱和密码。' });
    }

    const [rows] = await db.query('SELECT * FROM users WHERE email=? LIMIT 1', [email]);
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ message: '邮箱或密码错误。' });
    }

    if (user.status === 'disabled') {
      return res.status(403).json({ message: '该账号已被禁用。' });
    }

    if (isLockedUntilFuture(user.locked_until)) {
      return res.status(423).json({
        message: '该账号已被临时锁定，请稍后再试。',
      });
    }

    const ok = await bcrypt.compare(password, user.password_hash);

    if (!ok) {
      const nextAttempts = Number(user.login_attempts || 0) + 1;

      if (nextAttempts >= MAX_LOGIN_FAILURES) {
        await db.query(
          'UPDATE users SET login_attempts=?, locked_until=DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id=?',
          [nextAttempts, LOGIN_LOCK_MINUTES, user.id]
        );

        return res.status(423).json({
          message: '登录失败次数过多，账号已锁定 15 分钟。',
        });
      }

      await db.query(
        'UPDATE users SET login_attempts=?, locked_until=NULL WHERE id=?',
        [nextAttempts, user.id]
      );

      return res.status(401).json({ message: '邮箱或密码错误。' });
    }

    await db.query('UPDATE users SET login_attempts=0, locked_until=NULL WHERE id=?', [user.id]);

    setAuthCookie(req, res, signToken(user, sessionStartedAt));

    res.json({
      message: '登录成功。',
      user: publicUser(user),
    });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ message: '登录失败，请稍后再试。' });
  }
});

router.get('/me', authRequired, async (req, res) => {
  res.json({ user: publicUser(req.user) });
});

const logoutLimiter = rateLimit({
  windowMs: 60000, limit: 120, standardHeaders: true, legacyHeaders: false,
  skip: req => !getAuthTokenFromRequest(req),
  keyGenerator: req => sha256(getAuthTokenFromRequest(req) || ''),
  message: { message: '退出请求过于频繁，请一分钟后重试。' },
});
router.post('/logout', logoutLimiter, async (req, res) => {
  const token = getAuthTokenFromRequest(req);
  if (token) {
    let payload;
    try { payload = jwt.verify(token, process.env.JWT_SECRET); }
    catch (error) {
      if (!['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name)) throw error;
    }
    if (payload) {
      // Persist revocation before reporting success, including across PM2 workers/restarts.
      await db.query('INSERT IGNORE INTO auth_revocations (token_hash,expires_at) VALUES (?,?)',
        [sha256(token), payload.exp ? payload.exp * 1000 : 9223372036854775807n.toString()]);
      await db.query('DELETE FROM auth_revocations WHERE expires_at<? LIMIT 100', [Date.now()]);
    }
  }
  clearAuthCookie(req, res);
  res.json({ message: '已退出登录。' });
});

router.post('/forgot-password', authRateLimit({ name: 'forgot-password', windowMs: 60 * 60 * 1000, max: 5, includeEmail: true }), async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ message: '请填写邮箱。' });
    }

    const [rows] = await db.query(
      'SELECT id, username, email FROM users WHERE email=? LIMIT 1',
      [email]
    );

    const user = rows[0];
    if (!user || user.email.endsWith('@oauth.invalid')) {
      return res.json({ message: GENERIC_RESET_MESSAGE });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256(rawToken);

    await db.query('DELETE FROM password_resets WHERE user_id=? AND used_at IS NULL', [user.id]);

    await db.query(
      `
      INSERT INTO password_resets
      (user_id, token_hash, expires_at)
      VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))
      `,
      [user.id, tokenHash]
    );

    const config = await getMailConfig();
    const siteUrl = safeSiteUrl(config.site_url || process.env.SITE_URL);
    const resetUrl = `${siteUrl}/reset-password?token=${rawToken}`;
    const mailResult = await sendMail({
      to: user.email,
      subject: '[mooncci] 重置账户密码',
      text: `You requested to reset your mooncci password. This link is valid for 30 minutes:\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
      html: renderBrandedEmail({
        eyebrow: 'mooncci / ACCOUNT SECURITY',
        title: '重置你的账户密码',
        intro: `${user.username || user.email}，我们收到了你的密码重置请求。`,
        paragraphs: ['这个链接将在 30 分钟后失效。如果不是你本人发起，可以忽略这封邮件。'],
        cta: { label: '重置密码', url: resetUrl },
      }),
    });

    if (!mailResult.sent) {
      throw new Error(mailResult.reason || 'Password reset email was not sent.');
    }

    res.json({ message: GENERIC_RESET_MESSAGE });
  } catch (err) {
    console.error('[auth/forgot-password]', err);
    res.status(500).json({ message: '重置密码邮件发送失败，请稍后再试。' });
  }
});

router.post('/reset-password', authRateLimit({ name: 'reset-password', windowMs: 60 * 60 * 1000, max: 10 }), async (req, res) => {
  try {
    const token = String(req.body.token || '').trim();
    const password = String(req.body.password || '');

    if (!token || !password) {
      return res.status(400).json({ message: '缺少重置凭证或新密码。' });
    }
    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ message: passwordError });
    const tokenHash = sha256(token);
    const passwordHash = await bcrypt.hash(password, 10);
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      const [rows] = await connection.query(
        `
        SELECT pr.*, u.id AS user_id
        FROM password_resets pr
        JOIN users u ON u.id = pr.user_id
        WHERE pr.token_hash = ?
          AND pr.used_at IS NULL
          AND pr.expires_at > NOW()
        LIMIT 1
        FOR UPDATE
        `,
        [tokenHash]
      );

      const record = rows[0];
      if (!record) {
        await connection.rollback();
        return res.status(400).json({ message: 'Reset link is invalid or expired.' });
      }

      const [consumeResult] = await connection.query(
        'UPDATE password_resets SET used_at=NOW() WHERE id=? AND used_at IS NULL',
        [record.id]
      );

      if (consumeResult.affectedRows !== 1) {
        await connection.rollback();
        return res.status(400).json({ message: 'Reset link is invalid or expired.' });
      }

      await connection.query('UPDATE users SET password_hash=? WHERE id=?', [passwordHash, record.user_id]);
      await connection.query(
        'INSERT INTO auth_invalidations (user_id,invalid_before) VALUES (?,?) ON DUPLICATE KEY UPDATE invalid_before=GREATEST(invalid_before,VALUES(invalid_before))',
        [record.user_id, Date.now()]
      );
      await connection.query('UPDATE users SET login_attempts=0, locked_until=NULL WHERE id=?', [record.user_id]);
      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    res.json({ message: 'Password has been reset. Please log in again.' });
  } catch (err) {
    console.error('[auth/reset-password]', err);
    res.status(500).json({ message: '密码重置失败，请稍后再试。' });
  }
});

module.exports = router;

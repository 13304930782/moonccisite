const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const { AUTH_COOKIE_NAME, authRequired } = require('../middleware/auth');
const { sendMail, getMailConfig } = require('../lib/mailer');

const router = express.Router();

const authRateBuckets = new Map();

function getClientIp(req) {
  const cfIp = req.headers['cf-connecting-ip'];
  const realIp = req.headers['x-real-ip'];
  const forwarded = req.headers['x-forwarded-for'];

  return String(
    cfIp ||
      realIp ||
      (forwarded ? String(forwarded).split(',')[0].trim() : '') ||
      req.socket.remoteAddress ||
      ''
  ).replace('::ffff:', '');
}

function rateKeyEmail(req) {
  return String(req.body?.email || '').trim().toLowerCase();
}

function cleanupAuthRateBuckets(now) {
  if (authRateBuckets.size < 10000) return;

  for (const [key, bucket] of authRateBuckets.entries()) {
    if (bucket.resetAt <= now) authRateBuckets.delete(key);
  }
}

function authRateLimit({ name, windowMs, max, includeEmail = false }) {
  return (req, res, next) => {
    const now = Date.now();
    cleanupAuthRateBuckets(now);

    const email = includeEmail ? `:${rateKeyEmail(req)}` : '';
    const key = `${name}:${getClientIp(req)}${email}`;
    const bucket = authRateBuckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      authRateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    bucket.count += 1;

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ message: '请求过于频繁，请稍后再试。' });
    }

    next();
  };
}


const GENERIC_RESET_MESSAGE = '如果该邮箱存在，重置密码邮件将会发送。';
const PASSWORD_RULE_MESSAGE = '密码至少 8 位，并且需要同时包含字母和数字。';
const MAX_LOGIN_FAILURES = 5;
const LOGIN_LOCK_MINUTES = 15;
const AUTH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function validatePassword(password) {
  if (password.length < 8) return PASSWORD_RULE_MESSAGE;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return PASSWORD_RULE_MESSAGE;
  return '';
}

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    can_comment: user.can_comment,
  };
}

function shouldUseSecureCookie(req) {
  if (process.env.COOKIE_SECURE === 'false') return false;
  if (process.env.COOKIE_SECURE === 'true') return true;

  const siteUrl = process.env.SITE_URL || 'https://mooncci.site';
  return siteUrl.startsWith('https://') || req.secure || req.headers['x-forwarded-proto'] === 'https';
}

function authCookieOptions(req) {
  const options = {
    httpOnly: true,
    secure: shouldUseSecureCookie(req),
    sameSite: 'lax',
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE,
  };

  const cookieDomain = String(process.env.COOKIE_DOMAIN || '').trim();
  if (cookieDomain) {
    options.domain = cookieDomain;
  }

  return options;
}

function setAuthCookie(req, res, token) {
  res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions(req));
}

function clearAuthCookie(req, res) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    ...authCookieOptions(req),
    maxAge: undefined,
  });
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

    setAuthCookie(req, res, signToken(user));

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

router.post('/logout', async (req, res) => {
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
    if (!user) {
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
    const htmlResetUrl = escapeHtml(resetUrl);
    const displayName = escapeHtml(user.username || user.email);

    await sendMail({
      to: user.email,
      subject: '[Mooncci] Reset your password',
      text: `You requested to reset your Mooncci Blog password. This link is valid for 30 minutes:\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.8; color: #111827;">
          <h2>Reset your password</h2>
          <p>Hello, ${displayName}.</p>
          <p>You requested to reset your Mooncci Blog password. This link is valid for 30 minutes.</p>
          <p>
            <a href="${htmlResetUrl}" style="display:inline-block;background:#2563eb;color:white;padding:10px 18px;border-radius:999px;text-decoration:none;">
              Reset password
            </a>
          </p>
          <p style="color:#6b7280;font-size:13px;">If you did not request this, you can ignore this email.</p>
        </div>
      `,
    });

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

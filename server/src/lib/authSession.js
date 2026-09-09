const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { AUTH_COOKIE_NAME } = require('../middleware/auth');
const AUTH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
function signToken(user, sessionStartedAt) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      sessionStartedAt,
      jti: crypto.randomUUID(),
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


module.exports = { signToken, publicUser, authCookieOptions, setAuthCookie, clearAuthCookie };

const jwt = require('jsonwebtoken');
const db = require('../db');

const AUTH_COOKIE_NAME = 'mooncci_token';

function isAdminLike(user) {
  return user?.role === 'owner' || user?.role === 'admin';
}

function isEditorLike(user) {
  return user?.role === 'owner' || user?.role === 'admin' || user?.role === 'editor';
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const output = {};

  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;

    try {
      output[key] = decodeURIComponent(value);
    } catch {
      output[key] = value;
    }
  }

  return output;
}

function getAuthTokenFromRequest(req) {
  const header = req.headers.authorization || '';

  if (header.startsWith('Bearer ')) {
    return header.slice(7);
  }

  return parseCookies(req)[AUTH_COOKIE_NAME] || null;
}

async function getUserFromRequest(req) {
  const token = getAuthTokenFromRequest(req);
  if (!token) return null;

  const payload = jwt.verify(token, process.env.JWT_SECRET);
  const [rows] = await db.query(
    'SELECT id, username, email, role, status, can_comment FROM users WHERE id=? LIMIT 1',
    [payload.id]
  );

  return rows[0] || null;
}

async function authRequired(req, res, next) {
  try {
    const user = await getUserFromRequest(req);

    if (!user) {
      return res.status(401).json({ message: 'Please log in first.' });
    }

    if (user.status === 'disabled') {
      return res.status(403).json({ message: 'This account is disabled.' });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Login session expired. Please log in again.' });
  }
}

function adminOnly(req, res, next) {
  if (!isAdminLike(req.user)) {
    return res.status(403).json({ message: 'Owner or admin permission is required.' });
  }

  next();
}

function editorOrAdmin(req, res, next) {
  if (!isEditorLike(req.user)) {
    return res.status(403).json({ message: 'Owner, admin or editor permission is required.' });
  }

  next();
}

module.exports = {
  AUTH_COOKIE_NAME,
  authRequired,
  adminOnly,
  editorOrAdmin,
  getAuthTokenFromRequest,
  getUserFromRequest,
  isAdminLike,
  isEditorLike,
};

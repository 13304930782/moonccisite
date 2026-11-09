const crypto = require('crypto');
const db = require('../db');

const SCOPES = ['comments:read', 'comments:moderate', 'publishing:read', 'runtime:read'];

async function serviceToken(req, res, next) {
  if (req.service) return next();
  if (!Object.prototype.hasOwnProperty.call(req.headers, 'x-service-token')) return next();
  res.set('Cache-Control', 'private, no-store');
  res.vary('X-Service-Token');
  const token = req.headers['x-service-token'];
  if (req.rawHeaders.filter((_, index) => index % 2 === 0 && req.rawHeaders[index].toLowerCase() === 'x-service-token').length !== 1 || typeof token !== 'string' || !/^mst_[A-Za-z0-9_-]{43}$/.test(token)) {
    return res.status(401).json({ message: 'Invalid service token.' });
  }
  try {
    const hash = crypto.createHash('sha256').update(token).digest();
    const [rows] = await db.query('SELECT id,name,token_hash,scopes,revoked_at FROM service_tokens WHERE token_hash=? LIMIT 1', [hash.toString('hex')]);
    const row = rows[0];
    const stored = row && /^[a-f0-9]{64}$/.test(row.token_hash) ? Buffer.from(row.token_hash, 'hex') : Buffer.alloc(32);
    if (!crypto.timingSafeEqual(hash, stored) || !row || row.revoked_at) return res.status(401).json({ message: 'Invalid service token.' });
    const scopes = typeof row.scopes === 'string' ? JSON.parse(row.scopes) : row.scopes;
    if (!Array.isArray(scopes) || scopes.some(scope => !SCOPES.includes(scope))) return res.status(401).json({ message: 'Invalid service token.' });
    const [result] = await db.query('UPDATE service_tokens SET last_used_at=CURRENT_TIMESTAMP WHERE id=? AND revoked_at IS NULL', [row.id]);
    if (!result.affectedRows) return res.status(401).json({ message: 'Invalid service token.' });
    req.service = { id: row.id, name: row.name, scopes };
    req.user = { id: 0, role: 'service', username: row.name };
    return next();
  } catch {
    return res.status(503).json({ message: 'Authentication service unavailable.' });
  }
}

function restrictAdminService(req, res, next) {
  if (!req.service) return next();
  if ((req.method === 'GET' && ['/comments', '/runtime'].includes(req.path)) ||
      (req.method === 'PUT' && /^\/comments\/[1-9][0-9]*$/.test(req.path))) return next();
  return res.status(403).json({ message: 'Service token cannot access this endpoint.' });
}

function requireScope(scope, fallback) {
  return (req, res, next) => req.service
    ? (req.service.scopes.includes(scope) ? next() : res.status(403).json({ message: 'Service token scope required.' }))
    : fallback(req, res, next);
}

module.exports = { serviceToken, requireScope, restrictAdminService, SCOPES };

const crypto = require('crypto');
const db = require('../db');
const { ownerOnly } = require('../middleware/auth');
const { SCOPES } = require('../middleware/serviceToken');
const router = require('../lib/asyncRouter')();
const routeLimiter = require('express-rate-limit')({ windowMs: 60000, limit: 60, standardHeaders: true, legacyHeaders: false });

router.use(ownerOnly, (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
router.post('/', routeLimiter, async (req, res) => {
  const { name, scopes } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100 || !Array.isArray(scopes) || !scopes.length || scopes.length > SCOPES.length || scopes.some(s => !SCOPES.includes(s)) || new Set(scopes).size !== scopes.length) {
    return res.status(400).json({ message: 'Invalid name or scopes.' });
  }
  const token = 'mst_' + crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const [result] = await db.query('INSERT INTO service_tokens (name,token_hash,scopes) VALUES (?,?,?)', [name.trim(), hash, JSON.stringify(scopes)]);
  return res.status(201).json({ id: result.insertId, name: name.trim(), scopes, token });
});
router.get('/', routeLimiter, async (_req, res) => {
  const [rows] = await db.query('SELECT id,name,scopes,created_at,last_used_at,revoked_at FROM service_tokens ORDER BY id DESC');
  res.json(rows.map(row => ({ ...row, scopes: typeof row.scopes === 'string' ? JSON.parse(row.scopes) : row.scopes })));
});
router.post('/:id/revoke', routeLimiter, async (req, res) => {
  if (!/^[1-9][0-9]*$/.test(req.params.id)) return res.status(400).json({ message: 'Invalid token ID.' });
  const [result] = await db.query('UPDATE service_tokens SET revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP) WHERE id=?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Service token not found.' });
  res.json({ message: 'Service token revoked.' });
});
module.exports = router;

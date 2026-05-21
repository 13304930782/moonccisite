const express = require('express');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.use(authRequired);

router.get('/me', async (req, res) => {
  const [rows] = await db.query(
    `
    SELECT *
    FROM editor_applications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [req.user.id]
  );

  res.json(rows[0] || null);
});

router.post('/', async (req, res) => {
  const { reason } = req.body;

  if (req.user.role === 'admin' || req.user.role === 'editor') {
    return res.status(400).json({ message: '你已经拥有写文章权限' });
  }

  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ message: '请填写申请理由' });
  }

  const [exists] = await db.query(
    `
    SELECT id
    FROM editor_applications
    WHERE user_id = ? AND status = 'pending'
    LIMIT 1
    `,
    [req.user.id]
  );

  if (exists[0]) {
    return res.status(400).json({ message: '你已经提交过申请，请等待管理员审核' });
  }

  await db.query(
    'INSERT INTO editor_applications (user_id, reason, status) VALUES (?, ?, "pending")',
    [req.user.id, String(reason).trim()]
  );

  res.json({ message: '申请已提交，请等待管理员审核' });
});

module.exports = router;

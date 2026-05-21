const express = require('express');
const db = require('../db');
const { authRequired, adminOnly, editorOrAdmin, isAdminLike } = require('../middleware/auth');
const { sendCommentReviewNotification } = require('../lib/mailer');

const router = express.Router();

function maskIp(ip) {
  if (!ip) return '';

  if (String(ip).includes(':')) {
    return String(ip).split(':').slice(0, 2).join(':') + ':****';
  }

  const parts = String(ip).split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.*.*`;
  }

  return '';
}



router.use(authRequired);

function isOwner(user) {
  return user?.role === 'owner';
}

function isSameUser(a, b) {
  return Number(a) === Number(b);
}

router.get('/users', adminOnly, async (_req, res) => {
  const [rows] = await db.query(
    'SELECT id,username,email,role,status,can_comment,created_at FROM users ORDER BY id DESC'
  );
  res.json(rows);
});

router.put('/users/:id', adminOnly, async (req, res) => {
  const { role, status, can_comment } = req.body;

  const [oldRows] = await db.query('SELECT * FROM users WHERE id=? LIMIT 1', [req.params.id]);
  const old = oldRows[0];

  if (!old) return res.status(404).json({ message: '用户不存在' });

  const nextRole = ['owner', 'admin', 'editor', 'user'].includes(role) ? role : old.role;
  const nextStatus = status === undefined ? old.status : status;

  if (!['active', 'disabled'].includes(nextStatus)) {
    return res.status(400).json({ message: 'User status is invalid' });
  }

  const nextCanComment =
    can_comment === undefined ? Number(old.can_comment) : Number(can_comment);

  if (![0, 1].includes(nextCanComment)) {
    return res.status(400).json({ message: 'Comment permission is invalid' });
  }

  if (old.role === 'owner' && !isOwner(req.user)) {
    return res.status(403).json({ message: 'Only owner can modify owner account' });
  }

  if (nextRole === 'owner' && !isOwner(req.user)) {
    return res.status(403).json({ message: 'Only owner can grant owner role' });
  }

  if (isSameUser(old.id, req.user.id) && nextRole !== old.role) {
    return res.status(400).json({ message: 'You cannot change your own role' });
  }

  if (isSameUser(old.id, req.user.id) && nextStatus === 'disabled') {
    return res.status(400).json({ message: 'You cannot disable your own account' });
  }

  await db.query(
    'UPDATE users SET role=?, status=?, can_comment=? WHERE id=?',
    [nextRole, nextStatus, nextCanComment, req.params.id]
  );

  res.json({ message: '更新成功' });
});

router.delete('/users/:id', adminOnly, async (req, res) => {
  const targetId = Number(req.params.id);

  if (!Number.isInteger(targetId) || targetId <= 0) {
    return res.status(400).json({ message: 'Invalid user id' });
  }

  const [oldRows] = await db.query(
    'SELECT id, role, status FROM users WHERE id=? LIMIT 1',
    [targetId]
  );
  const old = oldRows[0];

  if (!old) {
    return res.status(404).json({ message: 'User not found' });
  }

  if (isSameUser(old.id, req.user.id)) {
    return res.status(400).json({ message: 'You cannot delete your own account' });
  }

  if (old.role === 'owner' && !isOwner(req.user)) {
    return res.status(403).json({ message: 'Only owner can delete owner account' });
  }

  if (old.role === 'owner' && old.status === 'active') {
    const [ownerRows] = await db.query(
      'SELECT COUNT(*) AS count FROM users WHERE role="owner" AND status="active"'
    );
    const activeOwnerCount = Number(ownerRows[0]?.count || 0);

    if (activeOwnerCount <= 1) {
      return res.status(400).json({ message: 'You cannot disable the last active owner account' });
    }
  }

  await db.query(
    'UPDATE users SET status="disabled", can_comment=0 WHERE id=?',
    [targetId]
  );

  res.json({ message: 'User has been disabled. Posts and comments were kept.' });
});

router.get('/posts', editorOrAdmin, async (req, res) => {
  const params = [];
  let where = '';

  if (!isAdminLike(req.user)) {
    where = 'WHERE p.author_id = ?';
    params.push(req.user.id);
  }

  const [rows] = await db.query(
    `
    SELECT p.*,u.username AS author_name
    FROM posts p
    JOIN users u ON u.id=p.author_id
    ${where}
    ORDER BY p.updated_at DESC
    `,
    params
  );

  res.json(rows);
});

/**
 * 评论管理，仅管理员
 */
router.get('/comments', adminOnly, async (req, res) => {
  const status = req.query.status;
  const keyword = req.query.keyword;

  const where = [];
  const params = [];

  if (status && status !== 'all') {
    where.push('c.status = ?');
    params.push(status);
  }

  if (keyword) {
    where.push('(c.content LIKE ? OR u.username LIKE ? OR u.email LIKE ? OR p.title LIKE ? OR c.ip_address LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows] = await db.query(
    `
    SELECT
      c.id,
      c.post_id,
      c.user_id,
      c.parent_id,
      c.reply_to_user_id,
      c.content,
      c.status,
      c.ip_address,
      c.ip_location,
      c.user_agent,
      c.created_at,
      u.username AS author_name,
      u.email AS author_email,
      p.title AS post_title
    FROM comments c
    JOIN users u ON u.id = c.user_id
    JOIN posts p ON p.id = c.post_id
    ${whereSql}
    ORDER BY c.created_at DESC
    LIMIT 300
    `,
    params
  );

  res.json(rows.map((row) => ({
    ...row,
    ip_address_masked: maskIp(row.ip_address),
    ip_address: req.user.role === 'owner' ? row.ip_address : undefined,
  })));
});

/**
 * 更新评论状态
 * visible = 通过审核
 * rejected = 驳回
 * hidden = 隐藏
 * deleted = 删除
 */
router.put('/comments/:id', adminOnly, async (req, res) => {
  const { status } = req.body;

  if (!['pending', 'visible', 'hidden', 'deleted', 'rejected'].includes(status)) {
    return res.status(400).json({ message: '评论状态不合法' });
  }

  const [rows] = await db.query(
    `
    SELECT
      c.*,
      u.username AS author_name,
      u.email AS author_email,
      p.title AS post_title
    FROM comments c
    JOIN users u ON u.id = c.user_id
    JOIN posts p ON p.id = c.post_id
    WHERE c.id=?
    LIMIT 1
    `,
    [req.params.id]
  );

  const comment = rows[0];

  if (!comment) {
    return res.status(404).json({ message: '评论不存在' });
  }

  const allowedTransitions = {
    pending: ['visible', 'rejected', 'deleted'],
    visible: ['hidden', 'deleted'],
    hidden: ['visible', 'deleted'],
    rejected: ['deleted'],
    deleted: ['visible'],
  };

  if (comment.status !== status && !allowedTransitions[comment.status]?.includes(status)) {
    return res.status(400).json({ message: '不允许的评论状态流转' });
  }

  await db.query('UPDATE comments SET status=? WHERE id=?', [status, req.params.id]);

  if (status === 'visible' || status === 'rejected') {
    sendCommentReviewNotification(
      {
        postId: comment.post_id,
        postTitle: comment.post_title,
        authorName: comment.author_name,
        authorEmail: comment.author_email,
        content: comment.content,
      },
      status
    ).catch((err) => {
      console.error('[admin/comments] 审核结果邮件发送失败:', err.message);
    });
  }

  res.json({
    message:
      status === 'visible'
        ? '评论已通过，并已通知用户'
        : status === 'rejected'
          ? '评论已驳回，并已通知用户'
          : '更新成功',
  });
});

/**
 * 违禁词管理，仅管理员
 */
router.get('/banned-words', adminOnly, async (_req, res) => {
  const [rows] = await db.query('SELECT * FROM banned_words ORDER BY id DESC');
  res.json(rows);
});

router.post('/banned-words', adminOnly, async (req, res) => {
  const { word, action, replacement } = req.body;

  if (!word || !String(word).trim()) {
    return res.status(400).json({ message: '违禁词不能为空' });
  }

  await db.query(
    'INSERT INTO banned_words (word, action, replacement) VALUES (?, ?, ?)',
    [
      String(word).trim(),
      action === 'replace' ? 'replace' : 'block',
      replacement || '***',
    ]
  );

  res.json({ message: '添加成功' });
});

router.delete('/banned-words/:id', adminOnly, async (req, res) => {
  await db.query('DELETE FROM banned_words WHERE id=?', [req.params.id]);
  res.json({ message: '删除成功' });
});

/**
 * 编辑申请管理，仅管理员
 */
router.get('/editor-applications', adminOnly, async (req, res) => {
  const status = req.query.status || 'all';

  const params = [];
  let where = '';

  if (status !== 'all') {
    where = 'WHERE ea.status = ?';
    params.push(status);
  }

  const [rows] = await db.query(
    `
    SELECT
      ea.*,
      u.username,
      u.email,
      u.role,
      r.username AS reviewer_name
    FROM editor_applications ea
    JOIN users u ON u.id = ea.user_id
    LEFT JOIN users r ON r.id = ea.reviewer_id
    ${where}
    ORDER BY ea.created_at DESC
    `,
    params
  );

  res.json(rows);
});

router.put('/editor-applications/:id', adminOnly, async (req, res) => {
  const { status, review_note } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: '审核状态不合法' });
  }

  const [rows] = await db.query(
    `
    SELECT
      ea.*,
      u.role AS user_role,
      u.status AS user_status
    FROM editor_applications ea
    JOIN users u ON u.id = ea.user_id
    WHERE ea.id=?
    LIMIT 1
    `,
    [req.params.id]
  );

  const app = rows[0];

  if (!app) return res.status(404).json({ message: '申请不存在' });

  if (app.status !== 'pending') {
    return res.status(400).json({ message: 'This application has already been reviewed' });
  }

  if (status === 'approved') {
    if (app.user_status === 'disabled') {
      return res.status(400).json({ message: 'Cannot approve a disabled user' });
    }

    if (app.user_role !== 'user') {
      return res.status(400).json({ message: 'Only normal users can be promoted to editor' });
    }
  }

  await db.query(
    `
    UPDATE editor_applications
    SET status=?, reviewer_id=?, review_note=?, reviewed_at=NOW()
    WHERE id=?
    `,
    [status, req.user.id, review_note || '', req.params.id]
  );

  if (status === 'approved') {
    await db.query('UPDATE users SET role="editor" WHERE id=?', [app.user_id]);
  }

  res.json({ message: status === 'approved' ? '已通过申请，并授予编辑权限' : '已拒绝申请' });
});

module.exports = router;

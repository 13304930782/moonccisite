const { formatIpLocation } = require('../lib/geoip');
const express = require('express');
const db = require('../db');
const { authRequired, adminOnly, editorOrAdmin, isAdminLike } = require('../middleware/auth');
const { sendCommentReviewNotification, sendUserPermissionsNotification, accountPermissionChanges } = require('../lib/mailer');
const { attemptNotification, notificationMessage } = require('../lib/adminNotification');

const router = require('../lib/asyncRouter')();
// Keep a router-level ceiling when this module is mounted independently.
router.use(require('express-rate-limit')({ windowMs: 60000, limit: 300, standardHeaders: true, legacyHeaders: false }));

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

// Status and session invalidation must commit together: reactivation must never
// restore a token issued before the account was disabled.
async function persistAccountChange(sql, params, invalidateUserId, ownerActorId) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    if (ownerActorId !== undefined) {
      // Serialize owner changes and recheck the actor under the same lock.
      // Two owners must not concurrently disable/demote each other and leave
      // the site without an active owner.
      const [owners] = await connection.query('SELECT id,status FROM users WHERE role="owner" ORDER BY id FOR UPDATE');
      if (!owners.some(owner => Number(owner.id) === Number(ownerActorId) && owner.status === 'active')) {
        await connection.rollback();
        return 'forbidden';
      }
    }
    const [write] = await connection.query(sql, params);
    if (!write.affectedRows) {
      await connection.rollback();
      return false;
    }
    if (invalidateUserId !== undefined) {
      await connection.query(
        'INSERT INTO auth_invalidations (user_id,invalid_before) VALUES (?,?) ON DUPLICATE KEY UPDATE invalid_before=GREATEST(invalid_before,VALUES(invalid_before))',
        [invalidateUserId, Date.now()]
      );
    }
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

router.get('/users', adminOnly, async (req, res) => {
  const where = [], params = [];
  const keyword = String(req.query.keyword || '').trim().slice(0, 255);
  if (keyword) { where.push('(username LIKE ? OR email LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }
  for (const [field, allowed] of [['role', ['owner', 'admin', 'editor', 'teacher', 'user']], ['status', ['active', 'disabled']]]) {
    const value = req.query[field];
    if (value && value !== 'all') {
      if (!allowed.includes(value)) return res.status(400).json({ message: '筛选条件不合法' });
      where.push(`${field}=?`); params.push(value);
    }
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const paginated = req.query.page !== undefined || req.query.pageSize !== undefined;
  let { page, pageSize } = require('../lib/listPagination').listPagination(req.query);
  let total;
  if (paginated) {
    const [[count]] = await db.query(`SELECT COUNT(*) AS total FROM users ${whereSql}`, params);
    total = Number(count.total); page = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
  }
  const [rows] = await db.query(`SELECT id,username,email,role,status,can_comment,created_at FROM users ${whereSql} ORDER BY id DESC ${paginated ? 'LIMIT ? OFFSET ?' : ''}`,
    paginated ? [...params, pageSize, (page - 1) * pageSize] : params);
  res.json(paginated ? { items: rows, total, page, pageSize } : rows);
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

  const updated = { ...old, role: nextRole, status: nextStatus, can_comment: nextCanComment };
  if (!accountPermissionChanges(old, updated).length)
    return res.json({ message: '设置未变化，未重复发送通知', notification: { status: 'not_needed' } });
  const written = await persistAccountChange(
    'UPDATE users SET role=?, status=?, can_comment=? WHERE id=? AND role=? AND status=? AND can_comment <=> ?',
    [nextRole, nextStatus, nextCanComment, req.params.id, old.role, old.status, old.can_comment],
    nextStatus === 'disabled' ? old.id : undefined,
    old.role === 'owner' || nextRole === 'owner' ? req.user.id : undefined
  );
  if (written === 'forbidden') return res.status(403).json({ message: '站长权限已变化，请刷新后重试。' });
  if (!written) return res.status(409).json({ message: '用户设置已被更新，请刷新后重试。' });
  const notification = await attemptNotification(() => sendUserPermissionsNotification(old, updated));
  res.json({ message: notificationMessage('更新成功', notification), notification });
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

  if (old.role === 'owner' && !isOwner(req.user)) {
    return res.status(403).json({ message: 'Only owner can disable owner account' });
  }

  if (isSameUser(old.id, req.user.id)) {
    return res.status(400).json({ message: 'You cannot delete your own account' });
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

  const written = await persistAccountChange(
    'UPDATE users SET status="disabled", can_comment=0 WHERE id=? AND role=? AND status=?',
    [targetId, old.role, old.status],
    targetId,
    old.role === 'owner' ? req.user.id : undefined
  );
  if (written === 'forbidden') return res.status(403).json({ message: '站长权限已变化，请刷新后重试。' });
  if (!written) return res.status(409).json({ message: '用户设置已被更新，请刷新后重试。' });

  res.json({ message: 'User has been disabled. Posts and comments were kept.' });
});

router.get('/stats', editorOrAdmin, async (req, res) => {
  const manager = isAdminLike(req.user);
  const [[posts]] = await db.query(`SELECT COUNT(*) AS total FROM posts ${manager ? '' : 'WHERE author_id=?'}`, manager ? [] : [req.user.id]);
  const stats = { posts: Number(posts.total), users: 0, comments: 0, bannedWords: 0 };
  if (manager) {
    for (const [key, table] of [['users', 'users'], ['comments', 'comments'], ['bannedWords', 'banned_words']]) {
      const [[row]] = await db.query(`SELECT COUNT(*) AS total FROM ${table}`);
      stats[key] = Number(row.total);
    }
  }
  res.json(stats);
});

router.get('/posts', editorOrAdmin, async (req, res) => {
  const params = [];
  let where = '';
  if (!isAdminLike(req.user)) { where = 'WHERE p.author_id=?'; params.push(req.user.id); }
  const paginated = req.query.page !== undefined || req.query.pageSize !== undefined;
  let { page, pageSize } = require('../lib/listPagination').listPagination(req.query);
  let total;
  if (paginated) {
    const [[count]] = await db.query(`SELECT COUNT(*) AS total FROM posts p ${where}`, params);
    total = Number(count.total);
    page = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
  }
  const [rows] = await db.query(`
    SELECT p.id,p.title,p.summary,p.status,p.category,p.author_id,p.updated_at,u.username AS author_name
    FROM posts p JOIN users u ON u.id=p.author_id
    ${where} ORDER BY p.updated_at DESC,p.id DESC
    ${paginated ? 'LIMIT ? OFFSET ?' : ''}
  `, paginated ? [...params, pageSize, (page - 1) * pageSize] : params);
  res.json(paginated ? { items: rows, total, page, pageSize } : rows);
});

/**
 * 评论管理，仅管理员
 */
router.get('/comments', adminOnly, async (req, res) => {
  const status = req.query.status;
  const keyword = String(req.query.keyword || '').trim().slice(0, 255);
  const target = req.query.target || 'all';
  if (!['all', 'post', 'update'].includes(target)) return res.status(400).json({ message: '内容类型不合法' });
  if (status && !['all', 'pending', 'visible', 'rejected', 'hidden', 'deleted'].includes(status)) return res.status(400).json({ message: '评论状态不合法' });

  const where = [];
  const params = [];
  if (target === 'post') where.push('c.post_id IS NOT NULL');
  if (target === 'update') where.push('c.update_id IS NOT NULL');

  if (status && status !== 'all') {
    where.push('c.status = ?');
    params.push(status);
  }

  if (keyword) {
    where.push('(c.content LIKE ? OR u.username LIKE ? OR u.email LIKE ? OR COALESCE(p.title,n.content) LIKE ? OR c.ip_address LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const paginated = req.query.page !== undefined || req.query.pageSize !== undefined;
  let { page, pageSize } = require('../lib/listPagination').listPagination(req.query);
  let total;
  if (paginated) {
    const [[count]] = await db.query(`SELECT COUNT(*) AS total FROM comments c JOIN users u ON u.id=c.user_id LEFT JOIN posts p ON p.id=c.post_id LEFT JOIN updates n ON n.id=c.update_id ${whereSql}`, params);
    total = Number(count.total); page = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
  }
  const [rows] = await db.query(
    `
    SELECT
      c.id,
      c.post_id,
      c.update_id,
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
      COALESCE(p.title, LEFT(n.content,80)) AS post_title
    FROM comments c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN posts p ON p.id = c.post_id
    LEFT JOIN updates n ON n.id = c.update_id
    ${whereSql}
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT ? OFFSET ?
    `,
    [...params, paginated ? pageSize : 300, paginated ? (page - 1) * pageSize : 0]
  );

  const items = rows.map((row) => ({
    ...row,
    ip_location: formatIpLocation(row.ip_location),
    ip_address_masked: maskIp(row.ip_address),
    ip_address: req.user.role === 'owner' ? row.ip_address : undefined,
  }));
  res.json(paginated ? { items, total, page, pageSize } : items);
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
      COALESCE(p.title, LEFT(n.content,80)) AS post_title
    FROM comments c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN posts p ON p.id = c.post_id
    LEFT JOIN updates n ON n.id = c.update_id
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

  if (comment.status === status)
    return res.json({ message: '评论状态未变化，未重复发送通知', notification: { status: 'not_needed' } });
  const [write] = await db.query('UPDATE comments SET status=? WHERE id=? AND status=?', [status, req.params.id, comment.status]);
  if (!write.affectedRows) return res.status(409).json({ message: '评论已被其他操作更新，请刷新后重试。' });
  const notification = ['visible', 'rejected'].includes(status)
    ? await attemptNotification(() => sendCommentReviewNotification({
        postId: comment.post_id, updateId: comment.update_id, postTitle: comment.post_title,
        authorName: comment.author_name, authorEmail: comment.author_email, content: comment.content,
      }, status))
    : { status: 'not_needed' };
  const base = status === 'visible' ? '评论已通过' : status === 'rejected' ? '评论已驳回' : '更新成功';
  res.json({ message: notificationMessage(base, notification), notification });
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

router.put('/editor-applications/:id', adminOnly, async (req, res, next) => {
  const { status, review_note } = req.body;
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ message: '审核状态不合法' });
  let conn, committed = false, application, old, updated;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM editor_applications WHERE id=? LIMIT 1 FOR UPDATE', [req.params.id]);
    application = rows[0];
    if (!application) { await conn.rollback(); return res.status(404).json({ message: '申请不存在' }); }
    if (application.status !== 'pending') { await conn.rollback(); return res.status(400).json({ message: '该申请已经审核，未重复发送通知。' }); }
    if (status === 'approved') {
      const [users] = await conn.query('SELECT id, username, email, role, status, can_comment FROM users WHERE id=? LIMIT 1 FOR UPDATE', [application.user_id]);
      old = users[0];
      if (!old || old.status !== 'active' || old.role !== 'user') {
        await conn.rollback(); return res.status(400).json({ message: '仅可为启用中的普通用户授予编辑权限。' });
      }
      updated = { ...old, role: 'editor' };
      await conn.query('UPDATE users SET role="editor" WHERE id=?', [old.id]);
    }
    await conn.query('UPDATE editor_applications SET status=?, reviewer_id=?, review_note=?, reviewed_at=NOW() WHERE id=?',
      [status, req.user.id, review_note || '', req.params.id]);
    await conn.commit(); committed = true;
  } catch (error) {
    if (conn && !committed) await conn.rollback().catch(() => {});
    return next(error);
  } finally { conn?.release(); }
  const notification = updated ? await attemptNotification(() => sendUserPermissionsNotification(old, updated)) : { status: 'not_needed' };
  const base = status === 'approved' ? '已通过申请，并授予编辑权限' : '已拒绝申请';
  res.json({ message: notificationMessage(base, notification), notification });
});

module.exports = router;

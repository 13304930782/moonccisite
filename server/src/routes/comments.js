const express = require('express');
const db = require('../db');
const { authRequired, getUserFromRequest } = require('../middleware/auth');
const { sendCommentNotification } = require('../lib/mailer');
const { getIpLocation } = require('../lib/geoip');

const router = express.Router();

async function optionalUser(req) {
  try {
    const user = await getUserFromRequest(req);
    if (!user || user.status === 'disabled') return null;
    return user;
  } catch {
    return null;
  }
}

function getClientIp(req) {
  const cfIp = req.headers['cf-connecting-ip'];
  const realIp = req.headers['x-real-ip'];
  const forwarded = req.headers['x-forwarded-for'];

  const ip =
    cfIp ||
    realIp ||
    (forwarded ? String(forwarded).split(',')[0].trim() : '') ||
    req.socket.remoteAddress ||
    '';

  return String(ip).replace('::ffff:', '');
}

function maskIp(ip) {
  if (!ip) return '';

  if (ip.includes(':')) {
    return ip.split(':').slice(0, 2).join(':') + ':****';
  }

  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.*.*`;
  }

  return ip;
}

async function checkBannedWords(content) {
  const [words] = await db.query('SELECT * FROM banned_words ORDER BY id DESC');

  let output = content;

  for (const item of words) {
    if (!item.word) continue;

    if (output.includes(item.word)) {
      if (item.action === 'block') {
        return {
          ok: false,
          message: `评论包含违禁词：${item.word}`,
        };
      }

      if (item.action === 'replace') {
        const replacement = item.replacement || '***';
        output = output.split(item.word).join(replacement);
      }
    }
  }

  return {
    ok: true,
    content: output,
  };
}

/**
 * 前台获取评论
 * 1. 所有人只能看到 visible 评论
 * 2. 当前用户可以看到自己的 pending / rejected 评论
 * 3. 自己的 pending 评论永远排最上面
 * 4. 支持 sort=latest / oldest / likes
 */
router.get('/post/:postId', async (req, res) => {
  try {
    const viewer = await optionalUser(req);
    const sort = String(req.query.sort || 'latest');

    const params = [req.params.postId];
    let ownSql = '';

    if (viewer) {
      ownSql = `
        OR (
          c.user_id = ?
          AND c.status IN ('pending', 'rejected')
        )
      `;
      params.push(viewer.id);
    }

    let sortSql = 'c.created_at DESC';

    if (sort === 'oldest') {
      sortSql = 'c.created_at ASC';
    }

    if (sort === 'likes') {
      sortSql = 'like_count DESC, c.created_at DESC';
    }

    const viewerIdSql = viewer ? Number(viewer.id) : 0;

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
        c.created_at,
        u.username AS author_name,
        u.role AS author_role,
        ru.username AS reply_to_name,
        (
          SELECT COUNT(*)
          FROM comment_likes cl
          WHERE cl.comment_id = c.id
        ) AS like_count,
        ${
          viewer
            ? `EXISTS(
                SELECT 1
                FROM comment_likes cl2
                WHERE cl2.comment_id = c.id AND cl2.user_id = ?
              )`
            : '0'
        } AS liked_by_me
      FROM comments c
      JOIN users u ON u.id = c.user_id
      LEFT JOIN users ru ON ru.id = c.reply_to_user_id
      WHERE c.post_id = ?
        AND (
          c.status = 'visible'
          ${ownSql}
        )
      ORDER BY
        CASE
          WHEN c.user_id = ${viewerIdSql} AND c.status = 'pending' THEN 0
          WHEN c.user_id = ${viewerIdSql} AND c.status = 'rejected' THEN 1
          ELSE 2
        END,
        ${sortSql}
      `,
      [
        ...(viewer ? [viewer.id] : []),
        ...params,
        ...(viewer ? [viewer.id, viewer.id] : []),
      ]
    );

    const safeRows = rows.map((row) => {
      let status_text = '';

      if (row.status === 'pending') {
        status_text = '审核中';
      }

      if (row.status === 'rejected') {
        status_text = '未通过审核';
      }

      return {
        ...row,
        liked_by_me: Boolean(row.liked_by_me),
        like_count: Number(row.like_count || 0),
        status_text,
        ip_address_masked: maskIp(row.ip_address),
        ip_address: undefined,
      };
    });

    res.json(safeRows);
  } catch (err) {
    console.error('[comments/list]', err);
    res.status(500).json({ message: '评论加载失败' });
  }
});

/**
 * 发表评论 / 回复评论
 * 默认 pending，管理员审核后公开显示
 */
router.post('/post/:postId', authRequired, async (req, res) => {
  try {
    console.log('[comments/create] 收到新评论请求');

    const { content, parent_id, reply_to_user_id } = req.body;

    const normalizedContent = String(content || '').trim();

    if (!normalizedContent) {
      return res.status(400).json({ message: '评论内容不能为空' });
    }

    if (req.user.role !== 'owner' && normalizedContent.length > 1000) {
      return res.status(400).json({ message: '评论内容不能超过 1000 字' });
    }

    const [users] = await db.query(
      'SELECT id, username, email, role, status, can_comment FROM users WHERE id=? LIMIT 1',
      [req.user.id]
    );

    const user = users[0];

    if (!user) {
      return res.status(401).json({ message: '用户不存在' });
    }

    if (user.status === 'disabled') {
      return res.status(403).json({ message: '账号已被禁用' });
    }

    if (!['owner', 'admin', 'editor'].includes(user.role) && Number(user.can_comment) !== 1) {
      return res.status(403).json({ message: '你已被限制评论' });
    }

    const [posts] = await db.query(
      'SELECT id, title FROM posts WHERE id=? LIMIT 1',
      [req.params.postId]
    );

    const post = posts[0];

    if (!post) {
      return res.status(404).json({ message: '文章不存在' });
    }

    let normalizedParentId = parent_id || null;
    let normalizedReplyToUserId = reply_to_user_id || null;

    if (normalizedReplyToUserId) {
      const [replyUsers] = await db.query(
        `
        SELECT c.user_id
        FROM comments c
        WHERE c.post_id = ?
          AND c.user_id = ?
          AND c.status != 'deleted'
        LIMIT 1
        `,
        [req.params.postId, normalizedReplyToUserId]
      );

      if (!replyUsers[0]) {
        return res.status(400).json({ message: '被回复的用户不属于当前文章评论区' });
      }
    }

    if (normalizedParentId) {
      const [parents] = await db.query(
        'SELECT id, user_id, post_id, status FROM comments WHERE id=? AND post_id=? AND status != "deleted" LIMIT 1',
        [normalizedParentId, req.params.postId]
      );

      const parent = parents[0];

      if (!parent) {
        return res.status(404).json({ message: '被回复的评论不存在' });
      }

      const canReplyParent =
        parent.status === 'visible' ||
        ['owner', 'admin', 'editor'].includes(user.role);

      if (!canReplyParent) {
        return res.status(403).json({ message: '不能回复未公开的评论' });
      }

      if (!normalizedReplyToUserId) {
        normalizedReplyToUserId = parent.user_id;
      }
    }

    const checked = await checkBannedWords(normalizedContent);

    if (!checked.ok) {
      console.log('[comments/create] 命中违禁词，已拦截');
      return res.status(400).json({ message: checked.message });
    }

    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || '';
    const ipLocation = getIpLocation(ip);

    // 管理员和编辑的评论直接通过，普通用户评论进入审核
    const initialStatus = ['owner', 'admin', 'editor'].includes(user.role) ? 'visible' : 'pending';

    const [result] = await db.query(
      `
      INSERT INTO comments
      (post_id, user_id, parent_id, reply_to_user_id, content, ip_address, ip_location, user_agent, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        req.params.postId,
        user.id,
        normalizedParentId,
        normalizedReplyToUserId,
        checked.content,
        ip,
        ipLocation,
        userAgent,
        initialStatus,
      ]
    );

    console.log('[comments/create] 评论已入库，ID:', result.insertId, '状态:', initialStatus);

    if (initialStatus === 'pending') {
      console.log('[comments/create] 准备发送管理员审核提醒');

      sendCommentNotification({
        commentId: result.insertId,
        postTitle: post.title,
        authorName: user.username,
        authorEmail: user.email,
        content: checked.content,
        ip,
      })
        .then(() => {
          console.log('[comments/create] 管理员审核提醒已发送');
        })
        .catch((err) => {
          console.error('[comments/create] 管理员审核提醒发送失败:', err.message);
        });
    }

    res.json({
      message: initialStatus === 'visible'
        ? '评论已发布'
        : '评论已提交，正在审核中',
    });
  } catch (err) {
    console.error('[comments/create]', err);
    res.status(500).json({ message: '评论提交失败，请稍后重试' });
  }
});

/**
 * 点赞评论
 * 只有已通过的 visible 评论可以点赞
 */
router.post('/:id/like', authRequired, async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT id, role, status, can_comment FROM users WHERE id=? LIMIT 1',
      [req.user.id]
    );

    const user = users[0];

    if (!user || user.status === 'disabled') {
      return res.status(403).json({ message: '账号已被禁用' });
    }

    if (!['owner', 'admin', 'editor'].includes(user.role) && Number(user.can_comment) !== 1) {
      return res.status(403).json({ message: '你已被限制互动' });
    }

    const [rows] = await db.query(
      'SELECT id, status FROM comments WHERE id=? LIMIT 1',
      [req.params.id]
    );

    const comment = rows[0];

    if (!comment || comment.status !== 'visible') {
      return res.status(404).json({ message: '评论不存在或暂不可点赞' });
    }

    await db.query(
      'INSERT IGNORE INTO comment_likes (comment_id, user_id) VALUES (?, ?)',
      [req.params.id, req.user.id]
    );

    res.json({ message: '点赞成功' });
  } catch (err) {
    console.error('[comments/like]', err);
    res.status(500).json({ message: '点赞失败' });
  }
});

/**
 * 取消点赞
 */
router.delete('/:id/like', authRequired, async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT id, status FROM users WHERE id=? LIMIT 1',
      [req.user.id]
    );

    const user = users[0];

    if (!user || user.status === 'disabled') {
      return res.status(403).json({ message: '账号已被禁用' });
    }

    await db.query(
      'DELETE FROM comment_likes WHERE comment_id=? AND user_id=?',
      [req.params.id, req.user.id]
    );

    res.json({ message: '已取消点赞' });
  } catch (err) {
    console.error('[comments/unlike]', err);
    res.status(500).json({ message: '取消点赞失败' });
  }
});

/**
 * 删除评论
 */
/**
 * 删除评论
 * 权限：站长无限制，管理员不能删站长的评论，用户和编辑只能删自己的
 */
router.delete('/:id', authRequired, async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT c.*, u.role AS author_role
       FROM comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.id=? LIMIT 1`,
      [req.params.id]
    );

    const comment = rows[0];

    if (!comment) {
      return res.status(404).json({ message: '评论不存在' });
    }

    const isOwner = req.user.role === 'owner';
    const isAdmin = req.user.role === 'admin';
    const isAuthor = Number(comment.user_id) === Number(req.user.id);
    const targetIsOwner = comment.author_role === 'owner';

    // 站长无限制
    if (isOwner) {
      // allow
    } else if (isAdmin && targetIsOwner) {
      return res.status(403).json({ message: '管理员不能删除站长的评论' });
    } else if (isAdmin) {
      // allow admin
    } else if (isAuthor) {
      // allow author
    } else {
      return res.status(403).json({ message: '你没有权限删除这条评论' });
    }

    await db.query(
      'UPDATE comments SET status="deleted" WHERE id=?',
      [req.params.id]
    );

    res.json({ message: '评论已删除' });
  } catch (err) {
    console.error('[comments/delete]', err);
    res.status(500).json({ message: '删除评论失败' });
  }
});

module.exports = router;

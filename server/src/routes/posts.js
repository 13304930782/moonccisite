const express = require('express');
const db = require('../db');
const { authRequired, editorOrAdmin, isAdminLike, getUserFromRequest } = require('../middleware/auth');

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

function canManagePost(user, post) {
  return Boolean(user && (isAdminLike(user) || Number(post.author_id) === Number(user.id)));
}

function parseTags(raw) {
  try {
    if (Array.isArray(raw)) return raw;
    return JSON.parse(raw || '[]');
  } catch {
    return [];
  }
}

function clampInt(value, fallback, min, max) {
  const number = Number(value);

  if (!Number.isInteger(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, number));
}

function cleanString(value) {
  return value == null ? '' : String(value).trim();
}

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return value.map((tag) => cleanString(tag)).filter(Boolean).slice(0, 20);
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return normalizeTags(parsed);
    } catch {
      return value.split(',').map((tag) => cleanString(tag)).filter(Boolean).slice(0, 20);
    }
  }

  return [];
}

function normalizePostInput(body, oldPost = null) {
  const input = body || {};
  const next = {
    title: Object.prototype.hasOwnProperty.call(input, 'title') ? cleanString(input.title) : cleanString(oldPost?.title),
    slug: Object.prototype.hasOwnProperty.call(input, 'slug') ? cleanString(input.slug) : cleanString(oldPost?.slug),
    summary: Object.prototype.hasOwnProperty.call(input, 'summary') ? cleanString(input.summary) : cleanString(oldPost?.summary),
    content: Object.prototype.hasOwnProperty.call(input, 'content') ? String(input.content || '').trim() : String(oldPost?.content || '').trim(),
    cover_image: Object.prototype.hasOwnProperty.call(input, 'cover_image') ? cleanString(input.cover_image) : cleanString(oldPost?.cover_image),
    category: Object.prototype.hasOwnProperty.call(input, 'category') ? cleanString(input.category) : cleanString(oldPost?.category),
    tags: Object.prototype.hasOwnProperty.call(input, 'tags') ? normalizeTags(input.tags) : parseTags(oldPost?.tags),
    status: Object.prototype.hasOwnProperty.call(input, 'status') ? cleanString(input.status) : cleanString(oldPost?.status || 'draft'),
  };

  if (!next.title) return { error: '文章标题不能为空' };
  if (!next.slug) return { error: '文章 slug 不能为空' };
  if (!next.content) return { error: '文章内容不能为空' };
  if (!['draft', 'published'].includes(next.status)) return { error: '文章状态不合法' };

  return { value: next };
}

function buildListQuery(query) {
  const search = String(query.search || query.q || '').trim();
  const category = String(query.category || '').trim();
  const tag = String(query.tag || '').trim();
  const page = clampInt(query.page, 1, 1, 100000);
  const pageSize = clampInt(query.pageSize || query.limit, 50, 1, 100);
  const offset = (page - 1) * pageSize;

  const where = [`p.status = 'published'`];
  const params = [];

  if (search) {
    where.push(`(p.title LIKE ? OR p.summary LIKE ? OR p.content LIKE ? OR p.category LIKE ? OR p.tags LIKE ?)`);
    const keyword = `%${search}%`;
    params.push(keyword, keyword, keyword, keyword, keyword);
  }

  if (category) {
    where.push(`p.category = ?`);
    params.push(category);
  }

  if (tag) {
    where.push(`p.tags LIKE ?`);
    params.push(`%${tag}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  return {
    sql: `
      SELECT p.*, u.username AS author_name
      FROM posts p
      JOIN users u ON u.id = p.author_id
      ${whereSql}
      ORDER BY p.published_at DESC, p.created_at DESC
      LIMIT ? OFFSET ?
    `,
    params: [...params, pageSize, offset],
  };
}

router.get('/meta/categories', async (_req, res) => {
  const [rows] = await db.query(`
    SELECT category, COUNT(*) AS count
    FROM posts
    WHERE status = 'published'
      AND category IS NOT NULL
      AND category <> ''
    GROUP BY category
    ORDER BY count DESC, category ASC
  `);

  res.json(rows);
});

router.get('/meta/tags', async (_req, res) => {
  const [rows] = await db.query(`
    SELECT tags
    FROM posts
    WHERE status = 'published'
      AND tags IS NOT NULL
      AND tags <> ''
  `);

  const counter = new Map();

  rows.forEach((row) => {
    parseTags(row.tags).forEach((tag) => {
      if (!tag) return;
      counter.set(tag, (counter.get(tag) || 0) + 1);
    });
  });

  const result = Array.from(counter.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  res.json(result);
});

router.get('/', async (req, res) => {
  const { sql, params } = buildListQuery(req.query);
  const [rows] = await db.query(sql, params);
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const viewer = await optionalUser(req);
  const [rows] = await db.query(
    'SELECT p.*,u.username AS author_name FROM posts p JOIN users u ON u.id=p.author_id WHERE p.id=?',
    [req.params.id]
  );

  if (!rows[0]) return res.status(404).json({ message: '不存在' });

  if (rows[0].status !== 'published' && !canManagePost(viewer, rows[0])) {
    return res.status(404).json({ message: 'Not found' });
  }

  res.json(rows[0]);
});

router.post('/', authRequired, editorOrAdmin, async (req, res) => {
  try {
    const normalized = normalizePostInput(req.body);

    if (normalized.error) {
      return res.status(400).json({ message: normalized.error });
    }

    const p = normalized.value;
    const publishedAt = p.status === 'published' ? new Date() : null;

    await db.query(
      'INSERT INTO posts (title,slug,summary,content,cover_image,category,tags,status,author_id,published_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [
        p.title,
        p.slug,
        p.summary,
        p.content,
        p.cover_image,
        p.category,
        JSON.stringify(p.tags),
        p.status,
        req.user.id,
        publishedAt,
      ]
    );

    res.json({ message: '创建成功' });
  } catch (err) {
    console.error('[posts/create]', err);
    res.status(500).json({ message: '文章创建失败' });
  }
});

router.put('/:id', authRequired, editorOrAdmin, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM posts WHERE id=?', [req.params.id]);
    const old = rows[0];

    if (!old) return res.status(404).json({ message: '文章不存在' });

    if (!canManagePost(req.user, old)) {
      return res.status(403).json({ message: '无权限编辑这篇文章' });
    }

    const normalized = normalizePostInput(req.body, old);

    if (normalized.error) {
      return res.status(400).json({ message: normalized.error });
    }

    const p = normalized.value;
    const publishedAt = p.status === 'published' ? (old.published_at || new Date()) : null;

    await db.query(
      'UPDATE posts SET title=?,slug=?,summary=?,content=?,cover_image=?,category=?,tags=?,status=?,published_at=? WHERE id=?',
      [
        p.title,
        p.slug,
        p.summary,
        p.content,
        p.cover_image,
        p.category,
        JSON.stringify(p.tags),
        p.status,
        publishedAt,
        req.params.id,
      ]
    );

    res.json({ message: '更新成功' });
  } catch (err) {
    console.error('[posts/update]', err);
    res.status(500).json({ message: '文章更新失败' });
  }
});

router.delete('/:id', authRequired, editorOrAdmin, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM posts WHERE id=?', [req.params.id]);
  const old = rows[0];

  if (!old) return res.status(404).json({ message: '不存在' });

  if (!canManagePost(req.user, old)) {
    return res.status(403).json({ message: '无权限删除这篇文章' });
  }

  await db.query('DELETE FROM posts WHERE id=?', [req.params.id]);

  res.json({ message: '删除成功' });
});

module.exports = router;

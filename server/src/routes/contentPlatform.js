const {publicRelease}=require('../lib/publicContent');
const express = require('express');
const db = require('../platformDb');
const { authRequired, adminOnly, ownerOnly } = require('../middleware/auth');
const {
  asyncRoute: a,
  fail,
  str,
  updateInput,
  projectInput,
  pagination,
} = require('../lib/contentPlatform');
const { activity } = require('../repositories/activityRepository');
const router = require('../lib/asyncRouter')();
const admin = require('../lib/asyncRouter')();
admin.use(authRequired, adminOnly);
router.get(
  '/activity',
  a(async (req, res) => res.json(await activity(req.query))),
);
router.get(
  '/now',
  a(async (_req, res) => {
    const [rows] = await db.query('SELECT content,updated_at FROM site_now WHERE id=1');
    res.json(rows[0] || { content: '', updated_at: null });
  }),
);
admin.put(
  '/now',
  a(async (req, res) => {
    const content = str(req.body.content, 2000);
    await db.query(
      'INSERT INTO site_now (id,content) VALUES (1,?) ON DUPLICATE KEY UPDATE content=VALUES(content)',
      [content],
    );
    res.json({ ok: true });
  }),
);

router.get(
  '/updates',
  a(async (req, res) => {
    const { page, pageSize, offset } = pagination(req.query);
    const [[{ total }]] = await db.query(
      "SELECT COUNT(*) total FROM updates WHERE status='published'",
    );
    const [items] = await db.query(
      "SELECT id,content,image_url,published_at,updated_at FROM updates WHERE status='published' ORDER BY published_at DESC,id DESC LIMIT ? OFFSET ?",
      [pageSize, offset],
    );
    res.json({ items, total: Number(total), page, pageSize });
  }),
);
router.get(
  '/updates/:id',
  a(async (req, res) => {
    const [rows] = await db.query(
      "SELECT id,content,image_url,published_at,updated_at FROM updates WHERE id=? AND status='published'",
      [req.params.id],
    );
    if (!rows[0]) throw fail('动态不存在', 404);
    res.json(rows[0]);
  }),
);
admin.get(
  '/updates',
  a(async (req, res) => {
    const { page, pageSize, offset } = pagination(req.query);
    const [[{ total }]] = await db.query('SELECT COUNT(*) total FROM updates');
    const [items] = await db.query(
      'SELECT * FROM updates ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?',
      [pageSize, offset],
    );
    res.json({ items, total: Number(total), page, pageSize });
  }),
);
admin.post(
  '/updates',
  a(async (req, res) => {
    const v = updateInput(req.body);
    const [r] = await db.query(
      "INSERT INTO updates (content,image_url,status,author_id,published_at) VALUES (?,?,?,?,IF(?='published',UTC_TIMESTAMP(),NULL))",
      [v.content, v.image_url, v.status, req.user.id, v.status],
    );
    res.status(201).json({ id: r.insertId });
  }),
);
admin.put(
  '/updates/:id',
  a(async (req, res) => {
    const v = updateInput(req.body);
    const [r] = await db.query(
      "UPDATE updates SET content=?,image_url=?,published_at=IF(?='published',COALESCE(published_at,UTC_TIMESTAMP()),published_at),status=? WHERE id=?",
      [v.content, v.image_url, v.status, v.status, req.params.id],
    );
    if (!r.affectedRows) throw fail('动态不存在', 404);
    res.json({ ok: true });
  }),
);
router.get(
  '/projects',
  a(async (req, res) => {
    const { page, pageSize, offset } = pagination(req.query);
    const where =
      "status='published'" +
      (req.query.featured === 'true' ? ' AND featured_rank IS NOT NULL' : '');
    const [[{ total }]] = await db.query(`SELECT COUNT(*) total FROM projects WHERE ${where}`);
    const [items] = await db.query(
      `SELECT id,slug,name,summary,cover_image,tech_stack,stage,demo_url,repo,featured_rank FROM projects WHERE ${where} ORDER BY featured_rank IS NULL,featured_rank,id DESC LIMIT ? OFFSET ?`,
      [req.query.featured === 'true' ? 3 : pageSize, offset],
    );
    res.json({ items, total: Number(total), page, pageSize });
  }),
);
router.get(
  '/projects/:slug',
  a(async (req, res) => {
    const [rows] = await db.query(
      "SELECT id,slug,name,summary,content,cover_image,tech_stack,stage,demo_url,repo FROM projects WHERE slug=? AND status='published'",
      [req.params.slug],
    );
    if (!rows[0]) throw fail('作品不存在', 404);
    const { page, pageSize, offset } = pagination(req.query);
    const p = rows[0];
    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) total FROM project_releases r WHERE r.project_id=? AND r.repo=? AND ${publicRelease('r')}`,
      [p.id, p.repo],
    );
    const [items] = await db.query(
      `SELECT r.id,r.title,r.content,r.url,r.published_at FROM project_releases r WHERE r.project_id=? AND r.repo=? AND ${publicRelease('r')} ORDER BY r.published_at DESC,r.id DESC LIMIT ? OFFSET ?`,
      [p.id, p.repo, pageSize, offset],
    );
    const [focused] = req.query.release
      ? await db.query(
          `SELECT r.id,r.title,r.content,r.url,r.published_at FROM project_releases r WHERE r.id=? AND r.project_id=? AND r.repo=? AND ${publicRelease('r')}`,
          [req.query.release, p.id, p.repo],
        )
      : [[]];
    res.json({
      ...p,
      focusedRelease: focused[0] || null,
      releases: { items, total: Number(total), page, pageSize },
    });
  }),
);
admin.get(
  '/projects',
  a(async (req, res) => {
    const { page, pageSize, offset } = pagination(req.query);
    const [[{ total }]] = await db.query('SELECT COUNT(*) total FROM projects');
    const [items] = await db.query(
      'SELECT p.*,s.last_success_at,s.next_attempt_at,s.error AS sync_error FROM projects p LEFT JOIN github_sync_state s ON s.project_id=p.id ORDER BY p.id DESC LIMIT ? OFFSET ?',
      [pageSize, offset],
    );
    res.json({
      items,
      total: Number(total),
      page,
      pageSize,
      syncConfigured: process.env.GITHUB_SYNC_ENABLED === 'true',
    });
  }),
);
admin.post(
  '/projects',
  a(async (req, res) => {
    const v = projectInput(req.body);
    if (v.repo && req.user.role !== 'owner') throw fail('仅站长可配置同步仓库', 403);
    const [r] = await db.query('INSERT INTO projects SET ?', v);
    res.status(201).json({ id: r.insertId });
  }),
);
admin.put(
  '/projects/:id',
  a(async (req, res) => {
    const v = projectInput(req.body);
    const [rows] = await db.query('SELECT repo FROM projects WHERE id=?', [req.params.id]);
    if (!rows[0]) throw fail('作品不存在', 404);
    if (v.repo !== rows[0].repo && req.user.role !== 'owner')
      throw fail('仅站长可配置同步仓库', 403);
    if (v.repo !== rows[0].repo) v.sync_enabled = 0;
    await db.query('UPDATE projects SET ? WHERE id=?', [v, req.params.id]);
    res.json({ ok: true });
  }),
);
admin.put(
  '/projects/:id/sync',
  ownerOnly,
  a(async (req, res) => {
    if (typeof req.body.enabled !== 'boolean') throw fail('同步开关不正确');
    const [rows] = await db.query('SELECT repo FROM projects WHERE id=?', [req.params.id]);
    if (!rows[0]) throw fail('作品不存在', 404);
    if (req.body.enabled && !rows[0].repo) throw fail('请先配置公开仓库');
    await db.query('UPDATE projects SET sync_enabled=? WHERE id=?', [
      req.body.enabled ? 1 : 0,
      req.params.id,
    ]);
    res.json({ ok: true });
  }),
);
admin.post(
  '/projects/:id/sync',
  ownerOnly,
  a(async (req, res) => {
    const { syncProject } = require('../services/githubSync');
    res.json(await syncProject(Number(req.params.id), true));
  }),
);
admin.get(
  '/projects/:id/releases',
  a(async (req, res) => {
    const { page, pageSize, offset } = pagination(req.query);
    const [[{ total }]] = await db.query(
      'SELECT COUNT(*) total FROM project_releases WHERE project_id=?',
      [req.params.id],
    );
    const [items] = await db.query(
      'SELECT * FROM project_releases WHERE project_id=? ORDER BY published_at DESC LIMIT ? OFFSET ?',
      [req.params.id, pageSize, offset],
    );
    res.json({ items, total: Number(total), page, pageSize });
  }),
);
admin.put(
  '/releases/:id',
  a(async (req, res) => {
    if (typeof req.body.hidden !== 'boolean') throw fail('隐藏状态不正确');
    const [r] = await db.query('UPDATE project_releases SET hidden=? WHERE id=?', [
      req.body.hidden ? 1 : 0,
      req.params.id,
    ]);
    if (!r.affectedRows) throw fail('版本不存在', 404);
    res.json({ ok: true });
  }),
);
function errors(error, _req, res, next) {
  if (error.status) return res.status(error.status).json({ message: error.message });
  if (error.code === 'ER_DUP_ENTRY')
    return res.status(409).json({ message: '该标识已存在，请更换后重试' });
  next(error);
}
router.use(errors);
admin.use(errors);
module.exports = { router, admin };

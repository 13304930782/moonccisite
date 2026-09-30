// Keep sensitive routes bounded even when mounted independently of the main app.
const routeLimiter = require('express-rate-limit')({windowMs:60000,limit:200,standardHeaders:true,legacyHeaders:false});
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authRequired, editorOrAdmin, isAdminLike, getUserFromRequest } = require('../middleware/auth');

const router = require('../lib/asyncRouter')();
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.vary('Cookie');
  res.vary('Authorization');
  next();
});

async function optionalUser(req) {
  try { const user=await getUserFromRequest(req); return user && user.status !== 'disabled' ? user : null; } catch { return null; }
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
      SELECT p.*, u.username AS author_name, (SELECT deleted_at FROM account_profiles ap WHERE ap.user_id=u.id) AS author_deleted, (SELECT avatar_url FROM account_profiles ap WHERE ap.user_id=u.id) AS author_avatar
      FROM posts p
      JOIN users u ON u.id = p.author_id
      ${whereSql}
      ORDER BY COALESCE(p.updated_at, p.published_at, p.created_at) DESC, p.id DESC
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

require('../lib/articleDiscovery').attachDiscovery(router,db);

router.get('/', async (req, res) => {
  const { sql, params } = buildListQuery(req.query);
  const [rows] = await db.query(sql, params);
  if(req.query.format==='paged'){
    const countSql=sql.replace(/SELECT[\s\S]+?FROM posts p/,'SELECT COUNT(*) AS total FROM posts p').replace(/ORDER BY[\s\S]+$/,'');
    const [[count]]=await db.query(countSql,params.slice(0,-2));
    return res.json({items:rows,total:Number(count.total),page:clampInt(req.query.page,1,1,100000),pageSize:clampInt(req.query.pageSize||req.query.limit,50,1,100)});
  }
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const viewer = await optionalUser(req);
  const [rows] = await db.query(
    'SELECT p.*,u.username AS author_name, (SELECT deleted_at FROM account_profiles ap WHERE ap.user_id=u.id) AS author_deleted, (SELECT avatar_url FROM account_profiles ap WHERE ap.user_id=u.id) AS author_avatar FROM posts p JOIN users u ON u.id=p.author_id WHERE p.id=?',
    [req.params.id]
  );

  if (!rows[0]) return res.status(404).json({ message: '不存在' });

  if (rows[0].status !== 'published' && !canManagePost(viewer, rows[0])) {
    return res.status(404).json({ message: 'Not found' });
  }

  // Optional display metadata is read only after the existing visibility check.
  let image_dimensions = {};
  try { image_dimensions = await require('../lib/articleImages').articleImageDimensions(rows[0], db); }
  catch (error) { console.warn('[posts/image-dimensions]', error.code || 'unavailable'); }
  res.json({ ...rows[0], image_dimensions });
});

const revisions = require('../lib/articleRevisions');
const writeError=(message,status)=>Object.assign(new Error(message),{status});
async function writeTransaction(work){const c=await db.getConnection();try{await c.beginTransaction();const result=await work(c);await c.commit();return result;}catch(e){await c.rollback();throw e;}finally{c.release();}}
const writeHandler=work=>async(req,res)=>{try{res.json(await writeTransaction(c=>work(c,req)));}catch(e){if(e.status)return res.status(e.status).json({message:e.message});if(e.code==='ER_DUP_ENTRY')return res.status(409).json({message:'链接别名已存在。'});console.error('[posts/write]',e.code||'failed');res.status(500).json({message:'文章保存失败'});}};
const publishGuard=(req,res,next)=>require('../services/articleWorkflow').enabled()&&!isAdminLike(req.user)?res.status(403).json({message:'请通过我的投稿提交审核。'}):next();
router.post('/',authRequired,editorOrAdmin,publishGuard,writeHandler(async(c,req)=>{
 const normalized=normalizePostInput(req.body);if(normalized.error)throw writeError(normalized.error,400);
 const p=normalized.value;
 const [r]=await c.query('INSERT INTO posts (title,slug,summary,content,cover_image,category,tags,status,author_id,published_at) VALUES (?,?,?,?,?,?,?,?,?,?)',[p.title,p.slug,p.summary,p.content,p.cover_image,p.category,JSON.stringify(p.tags),p.status,req.user.id,p.status==='published'?new Date():null]);
 await revisions.record(c,{post_id:r.insertId},p,p.status==='published'?'publish':'manual',req.user.id,p.status==='published'?1:null);
 return {message:'创建成功'};
}));
router.put('/:id',authRequired,editorOrAdmin,publishGuard,writeHandler(async(c,req)=>{
 const [[old]]=await c.query('SELECT * FROM posts WHERE id=? FOR UPDATE',[req.params.id]);
 if(!old)throw writeError('文章不存在',404);
 if(!canManagePost(req.user,old))throw writeError('无权限编辑这篇文章',403);
 if(req.body.version!==old.version)throw writeError('文章版本已变化或缺少版本号，请刷新编辑页后重试。',409);
 const normalized=normalizePostInput(req.body,old);if(normalized.error)throw writeError(normalized.error,400);
 const p=normalized.value;const publishedAt=old.published_at||(p.status==='published'?new Date():null);
 await revisions.baseline(c,old,req.user.id);
 const [updated]=await c.query('UPDATE posts SET title=?,slug=?,summary=?,content=?,cover_image=?,category=?,tags=?,status=?,published_at=?,updated_at=NOW(),version=version+1 WHERE id=? AND version=?',[p.title,p.slug,p.summary,p.content,p.cover_image,p.category,JSON.stringify(p.tags),p.status,publishedAt,req.params.id,old.version]);
 if(!updated.affectedRows)throw writeError('文章已被更新，请刷新后重试。',409);
 await revisions.record(c,{post_id:old.id},p,p.status==='published'?'publish':'manual',req.user.id,p.status==='published'?old.version+1:null);
 return {message:'更新成功'};
}));

router.delete('/:id',routeLimiter, authRequired, editorOrAdmin, publishGuard, async (req, res) => {
 const c=await db.getConnection();
 try{
  await c.beginTransaction();
  const workflow=require('../services/articleWorkflow');
  const [[draft]]=await c.query('SELECT * FROM article_drafts WHERE post_id=? FOR UPDATE',[req.params.id]);
  if(draft&&workflow.enabled())await workflow.assertEditable(c,draft);
  const [[post]]=await c.query('SELECT * FROM posts WHERE id=? FOR UPDATE',[req.params.id]);
  if(!post){await c.rollback();return res.status(404).json({message:'不存在'});}
  if(!canManagePost(req.user,post)){await c.rollback();return res.status(403).json({message:'无权限删除这篇文章'});}
  if(draft&&workflow.enabled())await c.query('DELETE FROM article_workflows WHERE draft_id=?',[draft.id]);
  await c.query('DELETE FROM posts WHERE id=?',[post.id]);
  await c.commit();res.json({message:'删除成功'});
 }catch(e){await c.rollback();if(e.status)return res.status(e.status).json({message:e.message});throw e;}finally{c.release();}
});

module.exports = router;


// Keep sensitive routes bounded even when mounted independently of the main app.
const routeLimiter = require('express-rate-limit')({windowMs:60000,limit:200,standardHeaders:true,legacyHeaders:false});
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authRequired, editorOrAdmin, isAdminLike, getUserFromRequest } = require('../middleware/auth');
const {coverCropForInput,withCoverCrop,serializeCoverCrop}=require('../lib/articleCoverCrop');

const {validateArticleSlug,resolveArticle,claimArticleSlug,articleSlugWriteError,displayArticleSlug}=require('../lib/articleSlug');
const router = require('../lib/asyncRouter')();
const translations=require('../lib/articleTranslations');
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
    aside: (Object.prototype.hasOwnProperty.call(input, 'aside') ? cleanString(input.aside) : cleanString(oldPost?.aside)) || null,
    content: Object.prototype.hasOwnProperty.call(input, 'content') ? String(input.content || '').trim() : String(oldPost?.content || '').trim(),
    cover_image: Object.prototype.hasOwnProperty.call(input, 'cover_image') ? cleanString(input.cover_image) : cleanString(oldPost?.cover_image),
    category: Object.prototype.hasOwnProperty.call(input, 'category') ? cleanString(input.category) : cleanString(oldPost?.category),
    tags: Object.prototype.hasOwnProperty.call(input, 'tags') ? normalizeTags(input.tags) : parseTags(oldPost?.tags),
    status: Object.prototype.hasOwnProperty.call(input, 'status') ? cleanString(input.status) : cleanString(oldPost?.status || 'draft'),
  };
  next.cover_crop = coverCropForInput(input, next.cover_image, oldPost);
  const summaryUnchanged = oldPost && next.summary === cleanString(oldPost.summary);
  const generated = input.summary_mode === 'ai' && require('../lib/articleSummaryProof').valid({ ...next, summary_receipt: input.summary_receipt });
  next.summary_mode = generated ? 'ai' : input.summary_mode === 'manual' || !summaryUnchanged ? 'manual' : (oldPost.summary_mode || '');
  next.summary_receipt = generated ? input.summary_receipt : '';

  if (next.aside && Array.from(next.aside).length > 40) return { error: '旁白不能超过 40 字。' };
  if (!next.title) return { error: '文章标题不能为空' };
  try { next.slug=validateArticleSlug(next.slug,oldPost?.slug); } catch(e) { return {error:e.message}; }
  if (!next.content) return { error: '文章内容不能为空' };
  if (!['draft', 'published'].includes(next.status)) return { error: '文章状态不合法' };

  return { value: next };
}

function buildListQuery(query) {
  const contentLocale=translations.locale(query.locale);
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
    if(contentLocale==='en'){where[where.length-1]=where[where.length-1].slice(0,-1)+" OR EXISTS (SELECT 1 FROM post_translations t WHERE t.post_id=p.id AND t.locale='en' AND t.status='published' AND (t.title LIKE ? OR t.summary LIKE ? OR t.content LIKE ?)))";params.push(keyword,keyword,keyword);}
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

router.get('/meta/categories', async (req, res) => {
  const [rows] = await db.query(`
    SELECT category, COUNT(*) AS count
    FROM posts
    WHERE status = 'published'
      AND category IS NOT NULL
      AND category <> ''
    GROUP BY category
    ORDER BY count DESC, category ASC
  `);

  if(translations.locale(req.query.locale)==='en')for(const row of rows)row.display_name=(await require('../lib/contentTranslations').localize(db,'category',{name:row.category},'en',{id:row.category})).name;
  res.json(rows);
});

router.get('/meta/tags', async (req, res) => {
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

  if(translations.locale(req.query.locale)==='en')for(const row of result)row.display_name=(await require('../lib/contentTranslations').localize(db,'tag',{name:row.tag},'en',{id:row.tag})).name;
  res.json(result);
});

require('../lib/articleDiscovery').attachDiscovery(router,db);

router.get('/', async (req, res) => {
  const { sql, params } = buildListQuery(req.query);
  const [rawRows] = await db.query(sql, params);
  const rows=await translations.publicPosts(db,rawRows,req.query.locale);
  if(req.query.format==='paged'){
    const countSql=sql.replace(/SELECT[\s\S]+?FROM posts p/,'SELECT COUNT(*) AS total FROM posts p').replace(/ORDER BY[\s\S]+$/,'');
    const [[count]]=await db.query(countSql,params.slice(0,-2));
    return res.json({items:rows.map(withCoverCrop),total:Number(count.total),page:clampInt(req.query.page,1,1,100000),pageSize:clampInt(req.query.pageSize||req.query.limit,50,1,100)});
  }
  res.json(rows.map(withCoverCrop));
});

router.get('/:id', async (req, res) => {
  const viewer = await optionalUser(req);
  const post=await resolveArticle(db,req.params.id);
  const rows=post?[post]:[];

  if (!rows[0]) return res.status(404).json({ message: '不存在' });

  if (rows[0].status !== 'published' && !canManagePost(viewer, rows[0])) {
    return res.status(404).json({ message: 'Not found' });
  }

  // Optional display metadata is read only after the existing visibility check.
  let image_dimensions = {};
  try { image_dimensions = await require('../lib/articleImages').articleImageDimensions(rows[0], db); }
  catch (error) { console.warn('[posts/image-dimensions]', error.code || 'unavailable'); }
  const localized=await translations.publicPost(db,rows[0],req.query.locale);
  res.json({ ...withCoverCrop({...localized,slug:displayArticleSlug(localized.slug)}), image_dimensions });
});

const revisions = require('../lib/articleRevisions');
const writeError=(message,status)=>Object.assign(new Error(message),{status});
async function writeTransaction(work){const c=await db.getConnection();try{await c.beginTransaction();const result=await work(c);await c.commit();return result;}catch(e){await c.rollback();throw e;}finally{c.release();}}
const writeHandler=work=>async(req,res)=>{try{res.json(await writeTransaction(c=>work(c,req)));}catch(e){e=articleSlugWriteError(e);if(e.status)return res.status(e.status).json({message:e.message});if(e.code==='ER_DUP_ENTRY')return res.status(409).json({message:'链接别名已存在。'});console.error('[posts/write]',e.code||'failed');res.status(500).json({message:'文章保存失败'});}};
const publishGuard=(req,res,next)=>require('../services/articleWorkflow').enabled()&&!isAdminLike(req.user)?res.status(403).json({message:'请通过我的投稿提交审核。'}):next();
const prepareSummary=async(req,res,next)=>{try{
 if(translations.locale(req.body.locale)!=='zh-CN')throw writeError('Use the translation draft endpoint to edit English.',400);
 let old=null;if(req.params.id){const [[row]]=await db.query('SELECT * FROM posts WHERE id=?',[req.params.id]);if(!row||!canManagePost(req.user,row))throw writeError('文章不存在或无权限。',404);if(req.body.version!==row.version)throw writeError('文章已变化，请刷新。',409);old=row;}
 const normalized=normalizePostInput(req.body,old);if(normalized.error)throw writeError(normalized.error,400);
 const p=normalized.value;
 if(p.status==='published'){const prepared=await require('../services/articleSummary').prepare(db,{...p,summary_mode:req.body.summary_mode||'',summary_receipt:req.body.summary_receipt||''},req.user.id);require('../lib/articleSummaryProof').assertReady(prepared);req.body={...req.body,summary:prepared.summary,summary_mode:prepared.summary_mode,summary_receipt:prepared.summary_receipt};}
 next();
}catch(e){if(e.status)return res.status(e.status).json({message:e.message});next(e);}};
router.post('/',authRequired,editorOrAdmin,publishGuard,prepareSummary,writeHandler(async(c,req)=>{
 const normalized=normalizePostInput(req.body);if(normalized.error)throw writeError(normalized.error,400);
 const p=normalized.value;
 const [r]=await c.query('INSERT INTO posts (title,slug,summary,`aside`,content,cover_image,cover_crop,category,tags,summary_mode,status,author_id,published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',[p.title,p.slug,p.summary,p.aside,p.content,p.cover_image,serializeCoverCrop(p.cover_crop),p.category,JSON.stringify(p.tags),p.summary_mode,p.status,req.user.id,p.status==='published'?new Date():null]);
 await claimArticleSlug(c,r.insertId,p.slug);
 await revisions.record(c,{post_id:r.insertId},p,p.status==='published'?'publish':'manual',req.user.id,p.status==='published'?1:null);
 return {message:'创建成功'};
}));
router.put('/:id',authRequired,editorOrAdmin,publishGuard,prepareSummary,writeHandler(async(c,req)=>{
 const [[old]]=await c.query('SELECT * FROM posts WHERE id=? FOR UPDATE',[req.params.id]);
 if(!old)throw writeError('文章不存在',404);
 if(!canManagePost(req.user,old))throw writeError('无权限编辑这篇文章',403);
 if(req.body.version!==old.version)throw writeError('文章版本已变化或缺少版本号，请刷新编辑页后重试。',409);
 const normalized=normalizePostInput(req.body,old);if(normalized.error)throw writeError(normalized.error,400);
 const p=normalized.value;const publishedAt=old.published_at||(p.status==='published'?new Date():null);
 await claimArticleSlug(c,old.id,p.slug,old.slug);
 await revisions.baseline(c,old,req.user.id);
 const [updated]=await c.query('UPDATE posts SET title=?,slug=?,summary=?,`aside`=?,content=?,cover_image=?,cover_crop=?,category=?,tags=?,summary_mode=?,status=?,published_at=?,updated_at=NOW(),version=version+1 WHERE id=? AND version=?',[p.title,p.slug,p.summary,p.aside,p.content,p.cover_image,serializeCoverCrop(p.cover_crop),p.category,JSON.stringify(p.tags),p.summary_mode,p.status,publishedAt,req.params.id,old.version]);
 if(!updated.affectedRows)throw writeError('文章已被更新，请刷新后重试。',409);
 await revisions.record(c,{post_id:old.id},p,p.status==='published'?'publish':'manual',req.user.id,p.status==='published'?old.version+1:null);
 return {message:'更新成功'};
}));

router.delete('/:id',routeLimiter, authRequired, editorOrAdmin, publishGuard, async (req, res) => {
 const c=await db.getConnection();
 try{
  await c.beginTransaction();
  const workflow=require('../services/articleWorkflow');
  const [drafts]=await c.query('SELECT * FROM article_drafts WHERE post_id=? ORDER BY id FOR UPDATE',[req.params.id]);
  if(workflow.enabled())for(const draft of drafts)await workflow.assertEditable(c,draft);
  const [[post]]=await c.query('SELECT * FROM posts WHERE id=? FOR UPDATE',[req.params.id]);
  if(!post){await c.rollback();return res.status(404).json({message:'不存在'});}
  if(!canManagePost(req.user,post)){await c.rollback();return res.status(403).json({message:'无权限删除这篇文章'});}
  if(workflow.enabled())await c.query('DELETE w FROM article_workflows w JOIN article_drafts d ON d.id=w.draft_id WHERE d.post_id=?',[post.id]);
  await c.query('DELETE FROM posts WHERE id=?',[post.id]);
  await c.commit();res.json({message:'删除成功'});
 }catch(e){await c.rollback();if(e.status)return res.status(e.status).json({message:e.message});throw e;}finally{c.release();}
});

router.use((error,_req,res,next)=>{if(['INVALID_LOCALE','TRANSLATION_UNAVAILABLE'].includes(error.code))return res.status(error.status).json({code:error.code,message:error.message});next(error);});
module.exports = router;


// Keep sensitive routes bounded even when mounted independently of the main app.
const routeLimiter = require('express-rate-limit')({windowMs:60000,limit:200,standardHeaders:true,legacyHeaders:false});
const db=require('../db');
const {authRequired,adminOnly}=require('../middleware/auth');
const {error}=require('../lib/articlePublishing');
const router=require('../lib/asyncRouter')();
router.use((req,res,next)=>require('../services/articleWorkflow').enabled()?next():res.status(404).json({message:'专栏功能尚未开启。'}));
router.use((_req,res,next)=>{res.set('Cache-Control','no-store');res.vary('Cookie');res.vary('Authorization');next();});
const guarded=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){if(e.status)return res.status(e.status).json({message:e.message});if(e.code==='ER_DUP_ENTRY')return res.status(409).json({message:'专栏链接已存在。'});throw e;}};
router.get('/',routeLimiter,guarded(async(req,res)=>{
 const admin=req.query.manage==='true';
 if(admin){const u=await require('../middleware/auth').getUserFromRequest(req);if(!u||u.status!=='active'||!['owner','admin'].includes(u.role))throw error('无权限。',403);res.set('Cache-Control','private, no-store');}
 const [items]=await db.query("SELECT s.*,COUNT(p.id) article_count FROM article_series s LEFT JOIN article_series_posts sp ON sp.series_id=s.id LEFT JOIN posts p ON p.id=sp.post_id AND p.status='published' GROUP BY s.id ORDER BY s.updated_at DESC");
 res.json({items:admin?items:items.filter(s=>Number(s.article_count)>0)});
}));
router.get('/article/:id',routeLimiter,guarded(async(req,res)=>{
 const [[row]]=await db.query("SELECT s.* FROM article_series s JOIN article_series_posts sp ON sp.series_id=s.id JOIN posts p ON p.id=sp.post_id WHERE p.id=? AND p.status='published'",[req.params.id]);
 if(!row)return res.json(null);
 const [items]=await db.query("SELECT p.id,p.title FROM article_series_posts sp JOIN posts p ON p.id=sp.post_id WHERE sp.series_id=? AND p.status='published' ORDER BY sp.position,p.id",[row.id]);
 const index=items.findIndex(x=>String(x.id)===req.params.id);
 res.json({series:row,previous:items[index-1]||null,next:items[index+1]||null});
}));
router.get('/manage/:id/articles',routeLimiter,authRequired,adminOnly,guarded(async(req,res)=>{
 res.set('Cache-Control','private, no-store');
 const [items]=await db.query('SELECT p.id,p.title,p.status FROM article_series_posts sp JOIN posts p ON p.id=sp.post_id WHERE sp.series_id=? ORDER BY sp.position,p.id',[req.params.id]);
 res.json({items});
}));
router.get('/:slug',routeLimiter,guarded(async(req,res)=>{
 const [[series]]=await db.query('SELECT * FROM article_series WHERE slug=?',[req.params.slug]);
 if(!series)throw error('专栏不存在。',404);
 const [items]=await db.query("SELECT p.id,p.title,p.summary,p.cover_image,p.published_at FROM article_series_posts sp JOIN posts p ON p.id=sp.post_id WHERE sp.series_id=? AND p.status='published' ORDER BY sp.position,p.id",[series.id]);
 if(!items.length)throw error('专栏暂未公开。',404);
 res.json({series,items});
}));
router.use(authRequired,adminOnly,(_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
function values(body){
 const title=String(body.title||'').trim(),slug=String(body.slug||'').trim(),description=String(body.description||''),cover=String(body.cover_image||'');
 if(!title||title.length>255||!/^[a-z0-9][a-z0-9-]{0,190}$/.test(slug)||description.length>10000||cover.length>500)throw error('请填写有效名称和小写字母、数字或连字符组成的链接。');
 return [title,slug,description,cover];
}
router.post('/',routeLimiter,guarded(async(req,res)=>{
 const automatic=!String(req.body.slug||'').trim();
 for(let attempt=0;attempt<3;attempt++){
  const slug=automatic?(String(req.body.title||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'series')+'-'+require('crypto').randomBytes(6).toString('hex'):req.body.slug;
  try{const [r]=await db.query('INSERT INTO article_series(title,slug,description,cover_image) VALUES (?,?,?,?)',values({...req.body,slug}));return res.json({id:r.insertId,slug});}catch(e){if(!automatic||e.code!=='ER_DUP_ENTRY')throw e;}
 }
 throw error('链接暂时无法生成，请重试。',503);
}));
router.put('/:id',routeLimiter,guarded(async(req,res)=>{await db.query('UPDATE article_series SET title=?,slug=?,description=?,cover_image=? WHERE id=?',[...values(req.body),req.params.id]);res.json({ok:true});}));
router.put('/:id/articles',routeLimiter,guarded(async(req,res)=>{
 const ids=req.body.post_ids;
 if(!Array.isArray(ids)||ids.length>300||ids.some(x=>!Number.isSafeInteger(x)||x<1)||new Set(ids).size!==ids.length)throw error('文章列表无效。');
 const c=await db.getConnection();try{await c.beginTransaction();
 const [[series]]=await c.query('SELECT id FROM article_series WHERE id=? FOR UPDATE',[req.params.id]);if(!series)throw error('专栏不存在。',404);
 if(ids.length){const [posts]=await c.query('SELECT id FROM posts WHERE id IN (?) FOR UPDATE',[ids]);if(posts.length!==ids.length)throw error('部分文章不存在。');}
 await c.query('DELETE FROM article_series_posts WHERE series_id=?',[series.id]);
 for(let i=0;i<ids.length;i++)await c.query('INSERT INTO article_series_posts(post_id,series_id,position) VALUES (?,?,?) ON DUPLICATE KEY UPDATE series_id=VALUES(series_id),position=VALUES(position)',[ids[i],series.id,i]);
 await c.commit();res.json({ok:true});
 }catch(e){await c.rollback();throw e;}finally{c.release();}
}));
router.delete('/:id',routeLimiter,guarded(async(req,res)=>{await db.query('DELETE FROM article_series WHERE id=?',[req.params.id]);res.json({ok:true});}));
module.exports=router;


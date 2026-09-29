const revisions=require('../lib/articleRevisions');
const db = require('../db');
const {authRequired,editorOrAdmin,isAdminLike,getUserFromRequest,adminOnly}=require('../middleware/auth');
const router=require('../lib/asyncRouter')();
const rateLimit=require('express-rate-limit');
const workflow=require('../services/articleWorkflow');
router.use(authRequired,(req,res,next)=>workflow.enabled()?next():editorOrAdmin(req,res,next),rateLimit({windowMs:60000,limit:120,standardHeaders:true,legacyHeaders:false}));
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const allowed=(user,row)=>isAdminLike(user)||Number(user.id)===Number(row.author_id);
const {payload}=require('../lib/articlePublishing');
function present(row){return {...row,payload:typeof row.payload==='string'?JSON.parse(row.payload):row.payload};}
const run=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){if(e.code==='ER_DUP_ENTRY')return res.status(409).json({message:'链接别名或草稿已存在，请重新加载后重试。'});if(e.status)return res.status(e.status).json({message:e.message});next(e);}};
async function transaction(req,fn){const c=await db.getConnection();try{await c.beginTransaction();const user=await getUserFromRequest(req);if(!user||user.status!=='active'||(!workflow.enabled()&&!['owner','admin','editor'].includes(user.role)))throw error('请重新登录。',401);const r=await fn(c,user);await c.commit();return r;}catch(e){await c.rollback();throw e;}finally{c.release();}}
async function get(c,id,user,lock=false){const [[row]]=await c.query(`SELECT d.*,p.status AS post_status FROM article_drafts d LEFT JOIN posts p ON p.id=d.post_id WHERE d.id=?${lock?' FOR UPDATE':''}`,[id]);if(!row||!allowed(user,row))throw error('草稿不存在或无权限。',404);const result=present(row);if(workflow.enabled()){const [[w]]=await c.query('SELECT state,reason,scheduled_at,draft_version FROM article_workflows WHERE draft_id=?',[id]);result.workflow=w||{state:'draft'};}return result;}
const fields=p=>[p.title.trim(),p.slug.trim(),p.summary,p.content,p.cover_image,p.category,JSON.stringify(p.tags)];
router.post('/import',adminOnly,rateLimit({windowMs:60000,limit:3,standardHeaders:true,legacyHeaders:false}),run(async(req,res)=>{
 const {importArticle}=require('../lib/articleImport');
 res.json(await importArticle(db,req.user,String(req.body.url||'')));
}));
router.get('/',run(async(req,res)=>{
  const mine=req.query.mine==='true'||!isAdminLike(req.user);
  const where=`WHERE ${workflow.enabled()?'1=1':'d.dirty=1'} ${mine?'AND d.author_id=?':''}`;
  const params=mine?[req.user.id]:[];
  const page=Math.max(1,Math.min(100000,parseInt(req.query.page,10)||1)),pageSize=20;
  const [[count]]=await db.query(`SELECT COUNT(*) AS total FROM article_drafts d ${where}`,params);
  const [rows]=await db.query(`SELECT d.id,d.post_id,d.version,d.updated_at,JSON_OBJECT('title',JSON_UNQUOTE(JSON_EXTRACT(d.payload,'$.title'))) AS payload,p.status AS post_status FROM article_drafts d LEFT JOIN posts p ON p.id=d.post_id ${where} ORDER BY d.updated_at DESC,d.id LIMIT ? OFFSET ?`,[...params,pageSize,(page-1)*pageSize]);const items=rows.map(present);if(workflow.enabled()&&items.length){const [states]=await db.query('SELECT draft_id,state,reason,scheduled_at FROM article_workflows WHERE draft_id IN (?)',[items.map(x=>x.id)]);for(const d of items)d.workflow=states.find(w=>w.draft_id===d.id)||{state:'draft'};}res.json({items,total:Number(count.total),page,pageSize});
}));
router.post('/',run(async(req,res)=>{
  const id=String(req.body.id||'');if(!/^[a-f0-9-]{36}$/.test(id))throw error('草稿标识无效。');
  const result=await transaction(req,async(c,user)=>{
    const [[existing]]=await c.query('SELECT id FROM article_drafts WHERE id=?',[id]);if(existing)return get(c,id,user);
    let post=null;
    if(req.body.post_id){const [[p]]=await c.query('SELECT * FROM posts WHERE id=? FOR UPDATE',[req.body.post_id]);if(!p||!allowed(user,p))throw error('文章不存在或无权限。',404);post=p;await revisions.baseline(c,p,user.id);const [[d]]=await c.query('SELECT id FROM article_drafts WHERE post_id=?',[p.id]);if(d)return get(c,d.id,user);}
    let tags=[];try{tags=post?(Array.isArray(post.tags)?post.tags:JSON.parse(post.tags||'[]')):[];}catch{}
    await c.query('INSERT INTO article_drafts(id,author_id,post_id,base_version,payload,dirty) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id',[id,post?.author_id||user.id,post?.id||null,post?.version||null,JSON.stringify(payload(post?{...post,tags}:req.body.payload)),post?.status==='published'?0:1]);return get(c,id,user);
  });res.json(result);
}));
router.get('/:id',run(async(req,res)=>res.json(await get(db,req.params.id,req.user))));
router.get('/:id/conflict',run(async(req,res)=>{
  res.json(await transaction(req,async(c,user)=>require('../lib/articleConflict').inspect(c,await get(c,req.params.id,user,true),user)));
}));
router.post('/:id/resolve-conflict',run(async(req,res)=>{
  res.json(await transaction(req,async(c,user)=>{
    const d=await get(c,req.params.id,user,true);
    await require('../lib/articleConflict').resolve(c,d,user,req.body);
    return get(c,d.id,user);
  }));
}));
router.put('/:id',run(async(req,res)=>{
  const p=payload(req.body.payload);
  if(req.body.save_kind && !['auto','manual'].includes(req.body.save_kind))throw error('保存类型无效。');
  res.json(await transaction(req,async(c,user)=>{const d=await get(c,req.params.id,user,true);if(workflow.enabled())await workflow.assertEditable(c,d);if(d.version!==req.body.version)throw error('服务器已有新版本，请查看并处理冲突。',409);
    if(d.post_id){const [[post]]=await c.query('SELECT * FROM posts WHERE id=? FOR UPDATE',[d.post_id]);if(!post||!allowed(user,post))throw error('文章不存在或无权限。',404);await revisions.baseline(c,post,user.id);}
    const changed=revisions.hash(p)!==revisions.hash(d.payload) || p.published_at!==d.payload.published_at;
    if(changed)await c.query('UPDATE article_drafts SET payload=?,version=version+1,dirty=1 WHERE id=?',[JSON.stringify(p),d.id]);
    if(changed&&workflow.enabled())await c.query("UPDATE article_workflows SET state='draft',reason='',scheduled_at=NULL WHERE draft_id=?",[d.id]);
    if(changed || req.body.save_kind==='manual')await revisions.record(c,d,p,req.body.save_kind==='manual'?'manual':'auto',user.id);
    await revisions.trimAutos(c,d);return get(c,d.id,user);}));
}));
router.post('/:id/publish',(req,res,next)=>workflow.enabled()?adminOnly(req,res,next):next(),run(async(req,res)=>{
  res.json(await transaction(req,async(c,user)=>{
    const d=await get(c,req.params.id,user,true);if(workflow.enabled())await workflow.assertEditable(c,d);
    if(d.published_version===req.body.version&&!d.dirty)return {...d,replayed:true};
    if(d.version!==req.body.version)throw error('草稿已经变化，请先保存最新内容。',409);
    await require('../lib/articlePublishing').publish(c,d,user);if(workflow.enabled())await c.query("UPDATE article_workflows SET state='published',reason='',scheduled_at=NULL WHERE draft_id=?",[d.id]);return get(c,d.id,user);
  }));
}));
router.post('/:id/withdraw',(req,res,next)=>workflow.enabled()?adminOnly(req,res,next):next(),run(async(req,res)=>{
  res.json(await transaction(req,async(c,user)=>{const d=await get(c,req.params.id,user,true);if(workflow.enabled())await workflow.assertEditable(c,d);if(d.version!==req.body.version||!d.post_id)throw error('请刷新文章后重试。',409);const [[p]]=await c.query('SELECT * FROM posts WHERE id=? FOR UPDATE',[d.post_id]);if(!p||!allowed(user,p)||p.version!==d.base_version)throw error('文章已变化，请刷新。',409);await c.query('UPDATE posts SET status="draft",version=version+1 WHERE id=?',[p.id]);await c.query('UPDATE article_drafts SET base_version=?,version=version+1,dirty=1,published_version=NULL WHERE id=?',[p.version+1,d.id]);return get(c,d.id,user);}));
}));
router.delete('/:id',run(async(req,res)=>{
  await transaction(req,async(c,user)=>{const d=await get(c,req.params.id,user,true);if(workflow.enabled())await workflow.assertEditable(c,d);if(d.version!==req.body.version)throw error('草稿已变化，请刷新。',409);if(workflow.enabled()&&d.post_id){
 const [[post]]=await c.query('SELECT * FROM posts WHERE id=? FOR UPDATE',[d.post_id]);
 if(!post)throw error('文章不存在。',404);
 let tags=[];try{tags=Array.isArray(post.tags)?post.tags:JSON.parse(post.tags||'[]');}catch{}
 await c.query('UPDATE article_drafts SET payload=?,base_version=?,version=version+1,dirty=?,published_version=? WHERE id=?',[JSON.stringify(payload({...post,tags})),post.version,post.status==='published'?0:1,post.status==='published'?d.version+1:null,d.id]);
 await c.query("UPDATE article_workflows SET state=?,reason='',scheduled_at=NULL WHERE draft_id=?",[post.status==='published'?'published':'draft',d.id]);return;
 }if(!d.post_id)await c.query('DELETE FROM article_revisions WHERE draft_id=? AND post_id IS NULL',[d.id]);if(workflow.enabled())await c.query('DELETE FROM article_workflows WHERE draft_id=?',[d.id]);await c.query('DELETE FROM article_drafts WHERE id=?',[d.id]);});res.json({message:'未发布修改已丢弃，已有文章保持不变。'});
}));
router.get('/:id/revisions',run(async(req,res)=>{
 const d=await get(db,req.params.id,req.user);const [where,args]=revisions.scope(d);
 const page=Math.max(1,Math.min(100000,parseInt(req.query.page,10)||1)),pageSize=20;
 const [[count]]=await db.query(`SELECT COUNT(*) AS total FROM article_revisions WHERE ${where}`,args);
 const [items]=await db.query(`SELECT r.id,r.kind,r.actor_id,u.username AS actor_name,r.created_at,r.updated_at,r.published_version FROM article_revisions r LEFT JOIN users u ON u.id=r.actor_id WHERE ${where.replace('post_id','r.post_id').replace('draft_id','r.draft_id')} ORDER BY r.id DESC LIMIT ? OFFSET ?`,[...args,pageSize,(page-1)*pageSize]);
 res.json({items,total:Number(count.total),page,pageSize});
}));
async function revision(c,d,id) {
 if(!/^\d+$/.test(String(id)))throw error('历史版本不存在。',404);
 const [where,args]=revisions.scope(d);
 const [[row]]=await c.query(`SELECT * FROM article_revisions WHERE id=? AND ${where}`,[id,...args]);
 if(!row)throw error('历史版本不存在。',404);
 return {...row,payload:typeof row.payload==='string'?JSON.parse(row.payload):row.payload};
}
router.get('/:id/revisions/:revision',run(async(req,res)=>{
 const d=await get(db,req.params.id,req.user);res.json(await revision(db,d,req.params.revision));
}));
router.post('/:id/revisions/:revision/restore',run(async(req,res)=>{
 res.json(await transaction(req,async(c,user)=>{
  const d=await get(c,req.params.id,user,true);if(workflow.enabled())await workflow.assertEditable(c,d);
  if(d.version!==req.body.version)throw error('草稿已变化，请刷新后重试。',409);
  if(d.post_id){const [[p]]=await c.query('SELECT * FROM posts WHERE id=? FOR UPDATE',[d.post_id]);if(!p||!allowed(user,p)||p.version!==d.base_version)throw error('文章已变化，请重新加载后恢复。',409);}
  const r=await revision(c,d,req.params.revision);
  await revisions.record(c,d,d.payload,'restore',user.id);
  // Publication dates and identity belong to the current draft, never the historical snapshot.
  const restored=payload({...d.payload,...r.payload,published_at:d.payload.published_at});
  await c.query('UPDATE article_drafts SET payload=?,version=version+1,dirty=1,published_version=NULL WHERE id=?',[JSON.stringify(restored),d.id]);
  if(workflow.enabled())await c.query("UPDATE article_workflows SET state='draft',reason='',scheduled_at=NULL WHERE draft_id=?",[d.id]);
  return get(c,d.id,user);
 }));
}));
module.exports=router;

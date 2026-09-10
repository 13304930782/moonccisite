const db = require('../db');
const {authRequired,editorOrAdmin,isAdminLike,getUserFromRequest}=require('../middleware/auth');
const router=require('../lib/asyncRouter')();
const rateLimit=require('express-rate-limit');
router.use(authRequired,editorOrAdmin,rateLimit({windowMs:60000,limit:120,standardHeaders:true,legacyHeaders:false}));
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const allowed=(user,row)=>isAdminLike(user)||Number(user.id)===Number(row.author_id);
const keys=['title','slug','summary','content','cover_image','category'];
function payload(input={}) {
  const p=Object.fromEntries(keys.map(k=>[k,String(input[k]??'')]));
  p.tags=Array.isArray(input.tags)?input.tags.map(String).map(x=>x.trim()).filter(Boolean).slice(0,20):[];
  if(p.title.length>255||p.slug.length>255||p.category.length>100||p.cover_image.length>500||p.content.length>500000||p.summary.length>10000)throw error('内容超出长度限制。');
  return p;
}
function present(row){return {...row,payload:typeof row.payload==='string'?JSON.parse(row.payload):row.payload};}
const run=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){if(e.code==='ER_DUP_ENTRY')return res.status(409).json({message:'链接别名或草稿已存在，请重新加载后重试。'});if(e.status)return res.status(e.status).json({message:e.message});next(e);}};
async function transaction(req,fn){const c=await db.getConnection();try{await c.beginTransaction();const user=await getUserFromRequest(req);if(!user||user.status!=='active'||!['owner','admin','editor'].includes(user.role))throw error('请重新登录。',401);const r=await fn(c,user);await c.commit();return r;}catch(e){await c.rollback();throw e;}finally{c.release();}}
async function get(c,id,user,lock=false){const [[row]]=await c.query(`SELECT d.*,p.status AS post_status FROM article_drafts d LEFT JOIN posts p ON p.id=d.post_id WHERE d.id=?${lock?' FOR UPDATE':''}`,[id]);if(!row||!allowed(user,row))throw error('草稿不存在或无权限。',404);return present(row);}
const fields=p=>[p.title.trim(),p.slug.trim(),p.summary,p.content,p.cover_image,p.category,JSON.stringify(p.tags)];
router.get('/',run(async(req,res)=>{
  const where=`WHERE d.dirty=1 ${isAdminLike(req.user)?'':'AND d.author_id=?'}`;
  const params=isAdminLike(req.user)?[]:[req.user.id];
  const page=Math.max(1,Math.min(100000,parseInt(req.query.page,10)||1)),pageSize=20;
  const [[count]]=await db.query(`SELECT COUNT(*) AS total FROM article_drafts d ${where}`,params);
  const [rows]=await db.query(`SELECT d.id,d.post_id,d.version,d.updated_at,JSON_OBJECT('title',JSON_UNQUOTE(JSON_EXTRACT(d.payload,'$.title'))) AS payload,p.status AS post_status FROM article_drafts d LEFT JOIN posts p ON p.id=d.post_id ${where} ORDER BY d.updated_at DESC,d.id LIMIT ? OFFSET ?`,[...params,pageSize,(page-1)*pageSize]);res.json({items:rows.map(present),total:Number(count.total),page,pageSize});
}));
router.post('/',run(async(req,res)=>{
  const id=String(req.body.id||'');if(!/^[a-f0-9-]{36}$/.test(id))throw error('草稿标识无效。');
  const result=await transaction(req,async(c,user)=>{
    const [[existing]]=await c.query('SELECT id FROM article_drafts WHERE id=?',[id]);if(existing)return get(c,id,user);
    let post=null;
    if(req.body.post_id){const [[p]]=await c.query('SELECT * FROM posts WHERE id=? FOR UPDATE',[req.body.post_id]);if(!p||!allowed(user,p))throw error('文章不存在或无权限。',404);post=p;const [[d]]=await c.query('SELECT id FROM article_drafts WHERE post_id=?',[p.id]);if(d)return get(c,d.id,user);}
    let tags=[];try{tags=post?(Array.isArray(post.tags)?post.tags:JSON.parse(post.tags||'[]')):[];}catch{}
    await c.query('INSERT INTO article_drafts(id,author_id,post_id,base_version,payload,dirty) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id',[id,post?.author_id||user.id,post?.id||null,post?.version||null,JSON.stringify(payload(post?{...post,tags}:req.body.payload)),post?.status==='published'?0:1]);return get(c,id,user);
  });res.json(result);
}));
router.get('/:id',run(async(req,res)=>res.json(await get(db,req.params.id,req.user))));
router.put('/:id',run(async(req,res)=>{
  const p=payload(req.body.payload);
  res.json(await transaction(req,async(c,user)=>{const d=await get(c,req.params.id,user,true);if(d.version!==req.body.version)throw error('服务器已有新版本，请查看并处理冲突。',409);await c.query('UPDATE article_drafts SET payload=?,version=version+1,dirty=1 WHERE id=?',[JSON.stringify(p),d.id]);return get(c,d.id,user);}));
}));
router.post('/:id/publish',run(async(req,res)=>{
  res.json(await transaction(req,async(c,user)=>{
    const d=await get(c,req.params.id,user,true);
    if(d.published_version===req.body.version&&!d.dirty)return {...d,replayed:true};
    if(d.version!==req.body.version)throw error('草稿已经变化，请先保存最新内容。',409);
    const p=payload(d.payload);if(!p.title.trim()||!p.content.trim())throw error('发布前请填写标题和正文。');
    if(!p.slug.trim())p.slug=`article-${d.id}`;
    let postId=d.post_id, nextVersion=1;
    if(postId){const [[post]]=await c.query('SELECT * FROM posts WHERE id=? FOR UPDATE',[postId]);if(!post||!allowed(user,post))throw error('无权限发布。',403);if(post.version!==d.base_version)throw error('公开文章已有新版本，请重新加载后编辑。',409);nextVersion=post.version+1;await c.query('UPDATE posts SET title=?,slug=?,summary=?,content=?,cover_image=?,category=?,tags=?,status="published",published_at=COALESCE(published_at,NOW()),version=version+1 WHERE id=?',[...fields(p),postId]);}
    else {const [r]=await c.query('INSERT INTO posts(title,slug,summary,content,cover_image,category,tags,status,author_id,published_at) VALUES (?,?,?,?,?,?,?,"published",?,NOW())',[...fields(p),d.author_id]);postId=r.insertId;}
    await c.query('UPDATE article_drafts SET post_id=?,base_version=?,dirty=0,published_version=version WHERE id=?',[postId,nextVersion,d.id]);return get(c,d.id,user);
  }));
}));
router.post('/:id/withdraw',run(async(req,res)=>{
  res.json(await transaction(req,async(c,user)=>{const d=await get(c,req.params.id,user,true);if(d.version!==req.body.version||!d.post_id)throw error('请刷新文章后重试。',409);const [[p]]=await c.query('SELECT * FROM posts WHERE id=? FOR UPDATE',[d.post_id]);if(!p||!allowed(user,p)||p.version!==d.base_version)throw error('文章已变化，请刷新。',409);await c.query('UPDATE posts SET status="draft",version=version+1 WHERE id=?',[p.id]);await c.query('UPDATE article_drafts SET base_version=?,version=version+1,dirty=1,published_version=NULL WHERE id=?',[p.version+1,d.id]);return get(c,d.id,user);}));
}));
router.delete('/:id',run(async(req,res)=>{
  await transaction(req,async(c,user)=>{const d=await get(c,req.params.id,user,true);if(d.version!==req.body.version)throw error('草稿已变化，请刷新。',409);await c.query('DELETE FROM article_drafts WHERE id=?',[d.id]);});res.json({message:'未发布修改已丢弃，已有文章保持不变。'});
}));
module.exports=router;

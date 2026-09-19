const db = require('../db');
const { authRequired } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const router = require('../lib/asyncRouter')();
router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');res.vary('Cookie');res.vary('Authorization');next();});
router.use(authRequired,rateLimit({windowMs:60000,limit:120,standardHeaders:true,legacyHeaders:false}));
router.param('postId',(req,res,next,value)=>{
 const id=Number(value);
 if(!/^[1-9]\d*$/.test(value)||!Number.isSafeInteger(id)||id>2147483647)return res.status(400).json({message:'文章编号无效。'});
 req.postId=id;next();
});
router.get('/',async(req,res)=>{
 // One consistent snapshot keeps totals and page contents aligned during removals.
 const c=await db.getConnection();
 try{
  await c.beginTransaction();
  const [[count]]=await c.query('SELECT COUNT(*) total FROM article_bookmarks WHERE user_id=?',[req.user.id]);
  const total=Number(count.total),pageSize=12;
  const requested=/^[1-9]\d*$/.test(String(req.query.page||''))?Number(req.query.page):1;
  const page=Math.min(Number.isSafeInteger(requested)?requested:1,Math.max(1,Math.ceil(total/pageSize)));
  const [rows]=await c.query(`SELECT b.id,b.post_id,b.created_at,p.status,p.title,p.summary,p.cover_image,p.category,p.tags,p.published_at,p.updated_at
    FROM article_bookmarks b JOIN posts p ON p.id=b.post_id WHERE b.user_id=?
    ORDER BY b.created_at DESC,b.id DESC LIMIT ? OFFSET ?`,[req.user.id,pageSize,(page-1)*pageSize]);
  const items=rows.map(r=>{
   const base={id:r.id,post_id:r.post_id,created_at:r.created_at,available:r.status==='published'};
   if(!base.available)return base;
   let tags=[];try{tags=typeof r.tags==='string'?JSON.parse(r.tags):r.tags;}catch{}
   return {...base,title:r.title,summary:r.summary,cover_image:r.cover_image,category:r.category,tags:Array.isArray(tags)?tags:[],published_at:r.published_at,updated_at:r.updated_at};
  });
  await c.commit();res.json({items,total,page,pageSize});
 }catch(e){await c.rollback();throw e;}finally{c.release();}
});
router.get('/:postId',async(req,res)=>{
 const [rows]=await db.query('SELECT id FROM article_bookmarks WHERE user_id=? AND post_id=?',[req.user.id,req.postId]);
 res.json({bookmarked:rows.length>0});
});
router.put('/:postId',async(req,res)=>{
 const c=await db.getConnection();
 try{
  await c.beginTransaction();
  // Lock the account first so a concurrent account deletion cannot leave bookmarks behind.
  const [[user]]=await c.query('SELECT status FROM users WHERE id=? FOR UPDATE',[req.user.id]);
  if(!user||user.status!=='active'){await c.rollback();return res.status(401).json({message:'登录状态已失效。'});}
  const [[post]]=await c.query('SELECT status FROM posts WHERE id=? FOR UPDATE',[req.postId]);
  if(!post||post.status!=='published'){await c.rollback();return res.status(404).json({message:'文章暂不可用。'});}
  await c.query('INSERT INTO article_bookmarks(user_id,post_id) VALUES (?,?) ON DUPLICATE KEY UPDATE id=id',[req.user.id,req.postId]);
  await c.commit();res.json({bookmarked:true});
 }catch(e){await c.rollback();throw e;}finally{c.release();}
});
router.delete('/:postId',async(req,res)=>{
 await db.query('DELETE FROM article_bookmarks WHERE user_id=? AND post_id=?',[req.user.id,req.postId]);
 res.json({bookmarked:false});
});
module.exports=router;

const db = require('../db');
const { authRequired, getUserFromRequest } = require('../middleware/auth');
const router = require('../lib/asyncRouter')();
const rateLimit = require('express-rate-limit');

router.use(rateLimit({ windowMs: 60000, limit: 120, standardHeaders: true, legacyHeaders: false }));
router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');res.vary('Cookie');res.vary('Authorization');next();});
router.param('postId',(req,res,next,value)=>{
 const id=Number(value);
 if(!/^[1-9]\d*$/.test(value)||!Number.isSafeInteger(id)||id>2147483647)return res.status(400).json({message:'文章编号无效。'});
 req.postId=id;next();
});
async function state(connection,postId,userId){
 const [[row]]=await connection.query('SELECT COUNT(*) AS total, COALESCE(MAX(user_id=?),0) AS liked FROM article_likes WHERE post_id=?',[userId||0,postId]);
 return {like_count:Number(row.total),liked:Boolean(row.liked)};
}
router.get('/:postId',async(req,res)=>{
 const [[post]]=await db.query('SELECT status FROM posts WHERE id=?',[req.postId]);
 if(!post||post.status!=='published')return res.status(404).json({message:'文章暂不可用。'});
 let viewer=null;try{viewer=await getUserFromRequest(req);}catch(error){if(!['JsonWebTokenError','TokenExpiredError','NotBeforeError'].includes(error.name))throw error;}
 return res.json(await state(db,req.postId,viewer?.status==='active'?viewer.id:0));
});
async function change(req,res,liked){
 const c=await db.getConnection();
 try{
  await c.beginTransaction();
  const [[user]]=await c.query('SELECT status FROM users WHERE id=? FOR UPDATE',[req.user.id]);
  if(!user||user.status!=='active'){await c.rollback();return res.status(401).json({message:'登录状态已失效。'});}
  const [[post]]=await c.query('SELECT status FROM posts WHERE id=? FOR UPDATE',[req.postId]);
  if(!post||post.status!=='published'){await c.rollback();return res.status(404).json({message:'文章暂不可用。'});}
  if(liked)await c.query('INSERT INTO article_likes(user_id,post_id) VALUES (?,?) ON DUPLICATE KEY UPDATE user_id=user_id',[req.user.id,req.postId]);
  else await c.query('DELETE FROM article_likes WHERE user_id=? AND post_id=?',[req.user.id,req.postId]);
  const result=await state(c,req.postId,req.user.id);await c.commit();return res.json(result);
 }catch(error){await c.rollback();throw error;}finally{c.release();}
}
router.put('/:postId',authRequired,(req,res,next)=>change(req,res,true).catch(next));
router.delete('/:postId',authRequired,(req,res,next)=>change(req,res,false).catch(next));
module.exports=router;

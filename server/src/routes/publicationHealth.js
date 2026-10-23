const router=require('../lib/asyncRouter')();
const db=require('../db');
const health=require('../lib/publicationHealth');
const {authRequired,adminOnly}=require('../middleware/auth');
router.use(authRequired,adminOnly,(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.use(require('express-rate-limit')({windowMs:60000,limit:60,standardHeaders:true,legacyHeaders:false}));
const mutations=require('express-rate-limit')({windowMs:60000,limit:10,standardHeaders:true,legacyHeaders:false});
router.get('/',async(req,res)=>{
 const page=Number(req.query.page||1);
 if(!Number.isSafeInteger(page)||page<1||page>100000)return res.status(400).json({message:'页码无效。'});
 const [[{total}]]=await db.query("SELECT COUNT(*) AS total FROM posts WHERE status='published'");
 const [posts]=await db.query("SELECT id,slug,title,version,updated_at,status FROM posts WHERE status='published' ORDER BY updated_at DESC,id DESC LIMIT 20 OFFSET ?",[(page-1)*20]);
 res.json({page,total:Number(total),items:await health.postReports(posts),indexNow:await health.indexNowStatus()});
});
router.post('/:id/:action',mutations,async(req,res)=>{
 if(!/^[1-9][0-9]{0,9}$/.test(req.params.id)||!['check','submit','retry'].includes(req.params.action))return res.status(400).json({message:'无效操作。'});
 const [[post]]=await db.query("SELECT id,slug,title,version,status FROM posts WHERE id=? AND status='published'",[req.params.id]);
 if(!post)return res.status(404).json({message:'公开文章不存在。'});
 try {res.json(req.params.action==='check'?await health.checkPost(post,req.user.id):await health.queueIndexNow(post,req.user.id,req.params.action));}
 catch(error){if(error.status)return res.status(error.status).json({message:error.message});throw error;}
});
module.exports=router;

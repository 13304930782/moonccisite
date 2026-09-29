const db=require('../db');
const {authRequired,adminOnly}=require('../middleware/auth');
const workflow=require('../services/articleWorkflow');
const router=require('../lib/asyncRouter')();
router.get('/config',(_req,res)=>{res.set('Cache-Control','no-store');res.json({enabled:workflow.enabled()});});
router.use((req,res,next)=>{res.set('Cache-Control','private, no-store');res.vary('Cookie');res.vary('Authorization');return workflow.enabled()?next():res.status(404).json({message:'投稿功能尚未开启。'});});
router.use(authRequired,require('express-rate-limit')({windowMs:60000,limit:120,standardHeaders:true,legacyHeaders:false}));
router.get('/queue',adminOnly,async(req,res)=>{
 const page=Math.max(1,Math.min(100000,parseInt(req.query.page,10)||1)),state=['submitted','approved','scheduled','failed','rejected','published'].includes(req.query.state)?req.query.state:'submitted';
 const [[count]]=await db.query('SELECT COUNT(*) total FROM article_workflows w JOIN article_drafts d ON d.id=w.draft_id WHERE w.state=?',[state]);
 const [items]=await db.query("SELECT w.*,d.post_id,JSON_UNQUOTE(JSON_EXTRACT(w.snapshot,'$.title')) title,u.username author_name FROM article_workflows w JOIN article_drafts d ON d.id=w.draft_id JOIN users u ON u.id=d.author_id WHERE w.state=? ORDER BY w.updated_at,w.draft_id LIMIT 20 OFFSET ?",[state,(page-1)*20]);
 res.json({items,total:Number(count.total),page,pageSize:20});
});
router.post('/:id/:action',async(req,res)=>{
 try{res.json(await workflow.change(req.params.id,req.user,req.params.action,req.body));}
 catch(e){if(e.status)return res.status(e.status).json({message:e.message});throw e;}
});
module.exports=router;

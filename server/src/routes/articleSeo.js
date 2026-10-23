const db=require('../db');
const {authRequired,ownerOnly,editorOrAdmin}=require('../middleware/auth');
const workflow=require('../services/articleWorkflow');
const summary=require('../services/articleSummary');
const router=require('../lib/asyncRouter')();
const run=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){if(e.status)return res.status(e.status).json({message:e.message});next(e);}};
router.use(authRequired);
router.get('/status',run(async(req,res)=>res.json(summary.publicConfig(await summary.config(db)))));
router.get('/settings',ownerOnly,run(async(req,res)=>res.json(summary.publicConfig(await summary.config(db)))));
router.put('/settings',ownerOnly,run(async(req,res)=>res.json(await summary.saveConfig(db,req.body))));
const canGenerate=(req,res,next)=>workflow.enabled()?next():editorOrAdmin(req,res,next);
router.post('/generate',canGenerate,run(async(req,res)=>{
 if(req.user.status!=='active')return res.status(403).json({message:'账号不可用。'});
 const p=require('../lib/articlePublishing').payload(req.body.payload);
 const generated=await summary.prepare(db,p,req.user.id,{force:req.body.force===true});
 res.json({summary:generated.summary,summary_mode:generated.summary_mode,summary_receipt:generated.summary_receipt});
}));
router.post('/slug',canGenerate,run(async(req,res)=>{
 if(req.user.status!=='active')return res.status(403).json({message:'账号不可用。'});
 if(!req.body?.payload||typeof req.body.payload!=='object'||Array.isArray(req.body.payload))return res.status(400).json({message:'文章数据无效。'});
 const p=require('../lib/articlePublishing').payload(req.body.payload);
 const slug=await summary.generateSlug(p,await summary.config(db),req.user.id);
 res.json({slug});
}));
module.exports=router;

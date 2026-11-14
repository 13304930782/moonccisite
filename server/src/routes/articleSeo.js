const db=require('../db');
const {authRequired,ownerOnly,editorOrAdmin,isAdminLike}=require('../middleware/auth');
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
router.post('/translate',editorOrAdmin,run(async(req,res)=>{
 if(req.user.status!=='active')return res.status(403).json({message:'账号不可用。'});
 if(!req.body?.payload||typeof req.body.payload!=='object'||Array.isArray(req.body.payload))return res.status(400).json({message:'文章数据无效。'});
 const {sourcePostId,sourceBaseVersion}=req.body;
 const checkSource=async()=>{
  if(sourcePostId===undefined&&sourceBaseVersion===undefined)return;
  if(!Number.isSafeInteger(sourcePostId)||sourcePostId<1||!Number.isSafeInteger(sourceBaseVersion)||sourceBaseVersion<1)throw Object.assign(new Error('文章版本无效，请刷新后重试。'),{status:400});
  const [[post]]=await db.query('SELECT id,author_id,version FROM posts WHERE id=?',[sourcePostId]);
  if(!post||(!isAdminLike(req.user)&&Number(post.author_id)!==Number(req.user.id)))throw Object.assign(new Error('文章不存在或无权限。'),{status:404});
  if(Number(post.version)!==sourceBaseVersion)throw Object.assign(new Error('中文版文章已更新，请刷新并确认最新内容后再翻译。'),{status:409});
 };
 const p=require('../lib/articlePublishing').payload(req.body.payload);
 const summaryOnly=req.body.summaryOnly===true;
 if(summaryOnly&&!p.summary.trim())return res.status(400).json({message:'请先填写中文简介。'});
 // Reuse the existing translator, but send only the summary as translatable text.
 const input=summaryOnly?{...p,title:'.',summary:p.summary,content:'.'}:p;
 const controller=new AbortController();
 const cancel=()=>{if(!res.writableEnded)controller.abort();};
 res.on('close',cancel);
 try{
  await checkSource();
  const config=await summary.config(db), signal=AbortSignal.any([controller.signal,AbortSignal.timeout(180000)]);
  const streaming=(req.get('Accept')||'').split(',').some(value=>value.trim().split(';')[0]==='application/x-ndjson');
  if(summaryOnly||!streaming){const translated=await require('../services/articleTranslationAI').translate(input,config,req.user.id,fetch,signal);await checkSource();return res.json(summaryOnly?{summary:translated.summary}:translated);}
  res.set({'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'});
  const send=event=>{if(!res.destroyed&&!res.writableEnded)res.write(JSON.stringify(event)+'\n');};
  try{
   const translated=await require('../services/articleTranslationAI').translate(p,config,req.user.id,fetch,signal,progress=>send({type:'progress',...progress}));
   await checkSource();send({type:'complete',result:translated});
  }catch(e){send({type:'error',message:e.status?e.message:'AI 翻译暂时不可用，请重试。',status:e.status||500});}
  if(!res.destroyed)res.end();
 }finally{res.off('close',cancel);}
}));
module.exports=router;

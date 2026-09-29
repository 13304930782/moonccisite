const router=require('../lib/asyncRouter')(),db=require('../db');
const {authRequired,adminOnly}=require('../middleware/auth');
router.use(authRequired,adminOnly);
router.get('/config',(_req,res)=>res.json({enabled:require('../services/loginSessions').enabled()}));
router.use((_req,res,next)=>require('../services/loginSessions').enabled()?next():res.status(404).json({message:'运营概览尚未启用。'}));
router.get('/mail-failures',async(_req,res)=>{
 const [items]=await db.query("SELECT notification_id,attempts,last_error FROM notification_mail_jobs WHERE state='failed' ORDER BY notification_id DESC LIMIT 20");
 res.json({items:items.map(j=>({id:j.notification_id,attempts:j.attempts,reason:'邮件发送失败；现有记录未保留更细的原因。'}))});
});
router.post('/mail-failures/:id/retry',require('express-rate-limit')({windowMs:60000,limit:20,standardHeaders:true,legacyHeaders:false}),async(req,res)=>{
 if(!/^[1-9][0-9]*$/.test(req.params.id))return res.status(400).json({message:'无效任务编号。'});
 const engagement=require('../services/engagement'),mailer=require('../lib/mailer');
 if(!engagement.enabled())return res.status(409).json({message:'通知投递尚未启用，请先完成部署配置。'});
 if(!mailer.isMailEnabled(await mailer.getMailConfig(), 'notifications'))return res.status(409).json({message:'请先启用并保存完整邮件设置，再重试任务。'});
 const result=await engagement.transaction(async c=>{
  const [[job]]=await c.query("SELECT notification_id FROM notification_mail_jobs WHERE notification_id=? AND state='failed' FOR UPDATE",[req.params.id]);
  if(!job)return {status:409,message:'任务已被处理，请刷新列表。'};
  const [[n]]=await c.query('SELECT n.*,u.email,u.status FROM account_notifications n JOIN users u ON u.id=n.user_id WHERE n.id=?',[job.notification_id]);
  const prefs=n&&await engagement.preferences(c,n.user_id),visible=n&&await engagement.visible(c,n);
  if(!n||!['comment','reply'].includes(n.kind)||n.status!=='active'||!prefs[n.kind+'_email']||prefs.verified_email!==n.email||!visible.available)return {status:409,message:'收件人已关闭订阅、邮箱未验证、账号不可用或内容已隐藏，不再重发。'};
  await c.query("UPDATE notification_mail_jobs SET state='pending',attempts=0,available_at=?,locked_at=0,lock_token='',last_error='' WHERE notification_id=? AND state='failed'",[Date.now(),job.notification_id]);
  return {status:200,message:'已重新排队；任务进程执行后才会发送，发送前会再次检查订阅和内容状态。'};
 });
 res.status(result.status).json({message:result.message});
});
function range(query){
 const today=new Date().toISOString().slice(0,10),days=Number(query.days||30);
 let end=query.to||today,start=query.from||new Date(Date.parse(end+'T00:00:00Z')-(days-1)*86400000).toISOString().slice(0,10);
 if(![start,end].every(x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x))throw Error('请选择有效日期。');
 const span=(Date.parse(end)-Date.parse(start))/86400000+1;
 if(span<1||span>90||end>today)throw Error('日期范围须为 1 至 90 天，且不能晚于今天。');
 return {start,end,days:span};
}
router.get('/',async(req,res)=>{
 let r;try{r=range(req.query);}catch{return res.status(400).json({message:'请选择有效的 1 至 90 天日期范围。'});}
 const {start,end}=r,startEpoch=Date.parse(start+'T00:00:00Z')/1000,endEpoch=Date.parse(end+'T00:00:00Z')/1000+86400;
 const [[workflows],[totals],[rank],[trend],[meta],[tasks],[mailFailures]]=await Promise.all([
 db.query("SELECT state,COUNT(*) AS count FROM article_workflows GROUP BY state"),
 db.query("SELECT (SELECT COUNT(*) FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.status='visible' AND p.status='published' AND c.created_at>=FROM_UNIXTIME(?) AND c.created_at<FROM_UNIXTIME(?)) AS comments,(SELECT COUNT(*) FROM article_bookmarks) AS bookmarks",[startEpoch,endEpoch]),
 db.query("SELECT p.id,p.title,COALESCE(v.views,0) AS views,COALESCE(c.comments,0) AS comments,COALESCE(b.bookmarks,0) AS bookmarks FROM posts p LEFT JOIN (SELECT path,SUM(views) AS views FROM analytics_daily WHERE day BETWEEN ? AND ? GROUP BY path) v ON v.path=CONCAT('/article/',p.id) LEFT JOIN (SELECT post_id,COUNT(*) AS comments FROM comments WHERE status='visible' AND created_at>=FROM_UNIXTIME(?) AND created_at<FROM_UNIXTIME(?) GROUP BY post_id) c ON c.post_id=p.id LEFT JOIN (SELECT post_id,COUNT(*) AS bookmarks FROM article_bookmarks GROUP BY post_id) b ON b.post_id=p.id WHERE p.status='published' ORDER BY views DESC,p.id DESC LIMIT 20",[start,end,startEpoch,endEpoch]),
 db.query("SELECT DATE_FORMAT(day,'%Y-%m-%d') AS day,SUM(views) AS views FROM analytics_daily WHERE day BETWEEN ? AND ? AND path REGEXP '^/article/[0-9]+$' GROUP BY day ORDER BY day",[start,end]),
 db.query('SELECT UNIX_TIMESTAMP(started_at)*1000 AS started_at FROM analytics_meta WHERE id=1'),
 db.query("SELECT w.draft_id,w.state,w.scheduled_at,w.reason,JSON_UNQUOTE(JSON_EXTRACT(w.snapshot,'$.title')) AS title FROM article_workflows w WHERE state IN ('submitted','scheduled','failed') ORDER BY FIELD(state,'failed','submitted','scheduled'),w.updated_at ASC LIMIT 12"),
 db.query("SELECT COUNT(*) AS count FROM notification_mail_jobs WHERE state='failed'")
 ]);
 const counts=Object.fromEntries(workflows.map(x=>[x.state,Number(x.count)])),startedAt=meta[0]?.started_at||null,startedDay=startedAt?new Date(Number(startedAt)).toISOString().slice(0,10):null;
 const map=new Map(trend.map(x=>[x.day,Number(x.views)]));
 res.json({...r,timezone:'UTC',startedAt,partial:!startedDay||start<startedDay,summary:{pending:counts.submitted||0,scheduled:counts.scheduled||0,failed:counts.failed||0,mailFailed:Number(mailFailures[0].count),comments:Number(totals[0].comments),bookmarks:Number(totals[0].bookmarks),views:trend.reduce((n,x)=>n+Number(x.views),0)},articles:rank,tasks,trend:Array.from({length:r.days},(_,i)=>{const day=new Date(Date.parse(start)+i*86400000).toISOString().slice(0,10);return {day,views:!startedDay||day<startedDay?null:map.get(day)||0};})});
});
module.exports=router;

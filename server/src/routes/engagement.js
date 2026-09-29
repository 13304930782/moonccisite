// Keep sensitive routes bounded even when mounted independently of the main app.
const routeLimiter = require('express-rate-limit')({windowMs:60000,limit:200,standardHeaders:true,legacyHeaders:false});
const db=require('../db'),crypto=require('crypto');
const {authRequired}=require('../middleware/auth');
const service=require('../services/engagement');
const router=require('../lib/asyncRouter')();
const fail=(message,status=400)=>Object.assign(Error(message),{status});
router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');res.vary('Cookie');res.vary('Authorization');next();});
router.get('/config',(_req,res)=>res.json({enabled:service.enabled()}));
router.use((_req,res,next)=>service.enabled()?next():res.status(404).json({message:'功能尚未启用。'}));
router.get('/unsubscribe',routeLimiter,(req,res)=>{
 if(!/^[a-f0-9]{64}$/.test(String(req.query.token))||!['comment','reply'].includes(req.query.kind))return res.status(400).send('链接无效');
 // A GET only displays confirmation, so mail security scanners cannot unsubscribe users.
 const {escape}=require('../lib/seo');
 const token=escape(String(req.query.token)),kind=escape(req.query.kind);
 res.type('html').send('<meta charset="utf-8"><title>取消邮件通知</title><form method="post"><p>是否关闭这类评论邮件？站内通知会继续保留。</p><input type="hidden" name="token" value="'+token+'"><input type="hidden" name="kind" value="'+kind+'"><button>确认退订</button></form>');
});
router.post('/unsubscribe',routeLimiter,require('express').urlencoded({extended:false}),async(req,res)=>{
 const {token,kind}=req.body;
 if(!/^[a-f0-9]{64}$/.test(String(token))||!['comment','reply'].includes(kind))throw fail('链接无效');
 await db.query('UPDATE engagement_preferences SET '+kind+'_email=0 WHERE unsubscribe_token=?',[token]);res.type('text').send('已关闭此类邮件通知。');
});
router.use(authRequired,require('express-rate-limit')({windowMs:60000,limit:120,standardHeaders:true,legacyHeaders:false}));
router.get('/preferences',async(req,res)=>{
 const p=await service.preferences(db,req.user.id);res.json({comment_email:!!p.comment_email,reply_email:!!p.reply_email,history_enabled:!!p.history_enabled,email_verified:p.verified_email===req.user.email,history_epoch:Number(p.history_epoch)});
});
router.put('/preferences',async(req,res)=>service.transaction(async c=>{
 const p=await service.preferences(c,req.user.id,true);
 for(const key of ['comment_email','reply_email','history_enabled'])if(req.body[key]!==undefined&&typeof req.body[key]!=='boolean')throw fail('设置值无效。');
 if((req.body.comment_email||req.body.reply_email)&&p.verified_email!==req.user.email)throw fail('请先验证当前邮箱。');
 const history=req.body.history_enabled??!!p.history_enabled;
 await c.query('UPDATE engagement_preferences SET comment_email=?,reply_email=?,history_enabled=?,history_epoch=history_epoch+? WHERE user_id=?',[Number(req.body.comment_email??p.comment_email),Number(req.body.reply_email??p.reply_email),Number(history),Number(history!==!!p.history_enabled),req.user.id]);
 // Cancel pending messages when disabled; re-enabling must not send old messages.
 for(const kind of ['comment','reply'])if(req.body[kind+'_email']===false)await c.query("UPDATE notification_mail_jobs j JOIN account_notifications n ON n.id=j.notification_id SET j.state='skipped' WHERE n.user_id=? AND n.kind=? AND j.state='pending'",[req.user.id,kind]);
 res.json({ok:true});
}));
router.post('/verify-email',async(req,res)=>{
 if(!require('../lib/accountSettings').emailValid(req.user.email))throw fail('请先在账号设置中绑定有效邮箱。');
 const code=String(crypto.randomInt(100000,1000000));
 await service.transaction(async c=>{
 const p=await service.preferences(c,req.user.id,true);if(Date.now()-Number(p.verify_sent)<60000)throw fail('请一分钟后重试。',429);
 await c.query('UPDATE engagement_preferences SET verify_hash=?,verify_expires=?,verify_sent=?,verify_attempts=0 WHERE user_id=?',[crypto.createHash('sha256').update(req.user.email+':'+code).digest('hex'),Date.now()+600000,Date.now(),req.user.id]);
 });
 const r=await require('../lib/mailer').sendMail({to:req.user.email,subject:'[mooncci] 验证通知邮箱',text:'验证码：'+code+'，10 分钟内有效。'});
 if(!r?.sent)throw fail('邮件服务尚未开启。',503);res.json({ok:true});
});
router.post('/verify-email/confirm',async(req,res)=>{
 const ok=await service.transaction(async c=>{
 const p=await service.preferences(c,req.user.id,true);
 if(Number(p.verify_expires)<Date.now()||p.verify_attempts>=5)return false;
 await c.query('UPDATE engagement_preferences SET verify_attempts=verify_attempts+1 WHERE user_id=?',[req.user.id]);
 if(p.verify_hash!==crypto.createHash('sha256').update(req.user.email+':'+String(req.body.code)).digest('hex'))return false;
 await c.query("UPDATE engagement_preferences SET verified_email=?,verify_hash='',verify_expires=0 WHERE user_id=?",[req.user.email,req.user.id]);return true;
 });if(!ok)throw fail('验证码无效或已过期。');res.json({ok:true});
});
router.get('/notifications',async(req,res)=>{
 const kind=['comment','reply','approved','rejected','published','failed'].includes(req.query.kind)?req.query.kind:null;
 const page=Math.max(1,Math.min(100000,Math.floor(Number(req.query.page))||1)),size=20;
 const [rows]=await db.query('SELECT * FROM account_notifications WHERE user_id=?'+(kind?' AND kind=?':'')+' ORDER BY id DESC LIMIT ? OFFSET ?',[req.user.id,...(kind?[kind]:[]),size,(Math.floor(page)-1)*size]);
 const [[count]]=await db.query('SELECT COUNT(*) total,SUM(is_read=0) unread FROM account_notifications WHERE user_id=?',[req.user.id]);
 const items=[];for(const n of rows){const v=await service.visible(db,n);items.push({id:n.id,kind:n.kind,is_read:!!n.is_read,created_at:n.created_at,...v,title:v.available?service.titles[n.kind]:'内容已不可用',message:v.available?n.message:''});}
 res.json({items,total:Number(count.total),unread:Number(count.unread||0),page,pageSize:size});
});
router.get('/notifications/unread',async(req,res)=>{const [[r]]=await db.query('SELECT COUNT(*) unread FROM account_notifications WHERE user_id=? AND is_read=0',[req.user.id]);res.json(r);});
router.put('/notifications/read',async(req,res)=>{
 if(req.body.id!==undefined&&!Number.isSafeInteger(Number(req.body.id)))throw fail('通知编号无效。');
 await db.query('UPDATE account_notifications SET is_read=1 WHERE user_id=?'+(req.body.id!==undefined?' AND id=?':''),[req.user.id,...(req.body.id!==undefined?[req.body.id]:[])]);res.json({ok:true});
});
router.get('/history',async(req,res)=>{
 const cutoff=Date.now()-180*86400000,pageSize=30;
 const [[count]]=await db.query("SELECT COUNT(*) total FROM article_reading_history h JOIN posts p ON p.id=h.post_id WHERE h.user_id=? AND p.status='published' AND h.updated_at>=?",[req.user.id,cutoff]);
 const page=Math.max(1,Math.min(Math.ceil(Number(count.total)/pageSize)||1,Math.floor(Number(req.query.page))||1));
 const [items]=await db.query("SELECT h.*,p.title FROM article_reading_history h JOIN posts p ON p.id=h.post_id WHERE h.user_id=? AND p.status='published' AND h.updated_at>=? ORDER BY h.updated_at DESC,h.post_id DESC LIMIT ? OFFSET ?",[req.user.id,cutoff,pageSize,(page-1)*pageSize]);res.json({items,total:Number(count.total),page,pageSize});
});
router.param('postId',(req,res,next,id)=>{if(!/^[1-9]\d*$/.test(id)||!Number.isSafeInteger(Number(id)))return res.status(400).json({message:'文章编号无效。'});next();});
router.get('/history/:postId',async(req,res)=>{
 const p=await service.preferences(db,req.user.id);
 const [[row]]=await db.query("SELECT h.* FROM article_reading_history h JOIN posts p ON p.id=h.post_id WHERE h.user_id=? AND h.post_id=? AND p.status='published' AND h.updated_at>=?",[req.user.id,req.params.postId,Date.now()-180*86400000]);
 res.json({enabled:!!p.history_enabled,epoch:Number(p.history_epoch),item:row||null});
});
router.put('/history/:postId',async(req,res)=>service.transaction(async c=>{
 const {anchor='',progress,revision,epoch}=req.body;
 if(typeof anchor!=='string'||anchor.length>200||!Number.isFinite(progress)||progress<0||progress>1||!Number.isSafeInteger(revision)||revision<0)throw fail('阅读进度无效。');
 const p=await service.preferences(c,req.user.id,true);
 if(!p.history_enabled||Number(epoch)!==Number(p.history_epoch))throw fail('阅读记录设置已变化。',409);
 const [[post]]=await c.query("SELECT id FROM posts WHERE id=? AND status='published'",[req.params.postId]);if(!post)throw fail('文章不可用。',404);
 const [[old]]=await c.query('SELECT revision FROM article_reading_history WHERE user_id=? AND post_id=? FOR UPDATE',[req.user.id,req.params.postId]);
 if(Number(old?.revision||0)!==revision)throw fail('另一页面已更新进度，请重新打开文章。',409);
 await c.query('INSERT INTO article_reading_history(user_id,post_id,anchor,progress,revision,updated_at) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE anchor=VALUES(anchor),progress=VALUES(progress),revision=VALUES(revision),updated_at=VALUES(updated_at)',[req.user.id,post.id,anchor,progress,revision+1,Date.now()]);
 res.json({revision:revision+1});
}));
router.delete(['/history','/history/:postId'],async(req,res)=>service.transaction(async c=>{
 await service.preferences(c,req.user.id,true);
 await c.query('UPDATE engagement_preferences SET history_epoch=history_epoch+1 WHERE user_id=?',[req.user.id]);
 await c.query('DELETE FROM article_reading_history WHERE user_id=?'+(req.params.postId?' AND post_id=?':''),[req.user.id,...(req.params.postId?[req.params.postId]:[])]);res.json({ok:true});
}));
router.use((e,_req,res,_next)=>{if(!e.status)console.error('[engagement]',e.code||e.message);res.status(e.status||500).json({message:e.status?e.message:'操作失败，请稍后重试。'});});
module.exports=router;


const crypto=require('crypto');
const db=require('../db');
const enabled=()=>process.env.ENGAGEMENT_ENABLED==='true';
async function transaction(fn){const c=await db.getConnection();try{await c.beginTransaction();const r=await fn(c);await c.commit();return r;}catch(e){await c.rollback();throw e;}finally{c.release();}}
async function preferences(c,userId,lock=false){
 await c.query('INSERT IGNORE INTO engagement_preferences(user_id,unsubscribe_token) VALUES (?,?)',[userId,crypto.randomBytes(32).toString('hex')]);
 const [[p]]=await c.query('SELECT * FROM engagement_preferences WHERE user_id=?'+(lock?' FOR UPDATE':''),[userId]);return p;
}
async function notify(c,{userId,actorId,key,kind,postId=null,commentId=null,draftId=null,message=''}){
 if(!enabled()||!userId||Number(userId)===Number(actorId))return;
 const [r]=await c.query('INSERT IGNORE INTO account_notifications(user_id,event_key,kind,post_id,comment_id,draft_id,message) VALUES (?,?,?,?,?,?,?)',[userId,key,kind,postId,commentId,draftId,message]);
 if(r.affectedRows&&['comment','reply'].includes(kind)){
  const p=await preferences(c,userId);
  if(p[kind+'_email'])await c.query('INSERT IGNORE INTO notification_mail_jobs(notification_id) VALUES (?)',[r.insertId]);
 }
}
async function commentEvent(c,id){
 if(!enabled())return;
 const [[row]]=await c.query("SELECT c.*,p.author_id,p.status post_status FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.id=?",[id]);
 if(!row||row.status!=='visible'||row.post_status!=='published')return;
 // Reply takes priority when the author is also the reply recipient.
 const recipients=new Map();if(row.author_id)recipients.set(Number(row.author_id),'comment');
 if(row.reply_to_user_id)recipients.set(Number(row.reply_to_user_id),'reply');
 for(const [userId,kind] of recipients)await notify(c,{userId,actorId:row.user_id,key:'comment:'+id,kind,postId:row.post_id,commentId:id});
}
async function workflowEvent(c,d,state,message='',actorId=null,keySuffix=''){
 if(!enabled()||!['approved','rejected','published','failed'].includes(state))return;
 const [[cycle]]=await c.query('SELECT cycle FROM engagement_workflow_cycles WHERE draft_id=?',[d.id]);
 await notify(c,{userId:d.author_id,actorId,key:'workflow:'+d.id+':'+d.version+':'+state+':'+(cycle?.cycle||0)+':'+keySuffix,kind:state,draftId:d.id,message});
}
async function visible(c,n){
 if(n.comment_id){const [[r]]=await c.query("SELECT c.id,p.title FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.id=? AND c.status='visible' AND p.status='published'",[n.comment_id]);return r?{available:true,title:r.title,url:'/article/'+n.post_id}: {available:false};}
 if(n.draft_id){const [[r]]=await c.query('SELECT id FROM article_drafts WHERE id=? AND author_id=?',[n.draft_id,n.user_id]);return r?{available:true,url:'/account/write?draft='+n.draft_id}:{available:false};}
 return {available:false};
}
const titles={comment:'你的文章收到新评论',reply:'你的评论收到回复',approved:'投稿审核已通过',rejected:'投稿已退回',published:'稿件已发布',failed:'定时发布失败'};
async function runMail(send=require('../lib/mailer').sendMail){
 if(!enabled())return;
 await db.query('DELETE FROM article_reading_history WHERE updated_at<?',[Date.now()-180*86400000]);
 const [jobs]=await db.query("SELECT notification_id FROM notification_mail_jobs WHERE (state='pending' AND available_at<=?) OR (state='sending' AND locked_at<?) ORDER BY notification_id LIMIT 30",[Date.now(),Date.now()-600000]);
 for(const j of jobs){
  const token=crypto.randomUUID();
  const [claim]=await db.query("UPDATE notification_mail_jobs SET state='sending',locked_at=?,lock_token=?,attempts=attempts+1 WHERE notification_id=? AND ((state='pending' AND available_at<=?) OR (state='sending' AND locked_at<?))",[Date.now(),token,j.notification_id,Date.now(),Date.now()-600000]);
  if(!claim.affectedRows)continue;
  try{
   const [[n]]=await db.query('SELECT n.*,u.email,u.status FROM account_notifications n JOIN users u ON u.id=n.user_id WHERE n.id=?',[j.notification_id]);
   const p=n&&await preferences(db,n.user_id),v=n&&await visible(db,n);
   if(!n||n.status!=='active'||!p[n.kind+'_email']||p.verified_email!==n.email||!v.available){
    await db.query("UPDATE notification_mail_jobs SET state='skipped' WHERE notification_id=? AND lock_token=?",[j.notification_id,token]);continue;
   }
   const origin=require('../lib/siteIdentity').siteOrigin();
   const unsubscribe=origin+'/api/engagement/unsubscribe?token='+p.unsubscribe_token+'&kind='+n.kind;
   const result=await send({channel:'notifications',to:n.email,subject:'[mooncci] '+titles[n.kind],text:titles[n.kind]+'\n\n查看：'+origin+v.url+'\n通知设置：'+origin+'/account/notifications\n退订这类邮件：'+unsubscribe});
   if(!result?.sent)throw Error('mail_disabled');
   await db.query("UPDATE notification_mail_jobs SET state='sent',last_error='' WHERE notification_id=? AND lock_token=?",[j.notification_id,token]);
  }catch{
   await db.query("UPDATE notification_mail_jobs SET state=IF(attempts>=5,'failed','pending'),available_at=?,last_error='邮件发送失败' WHERE notification_id=? AND lock_token=?",[Date.now()+300000,j.notification_id,token]);
  }
 }
}
module.exports={enabled,transaction,preferences,notify,commentEvent,workflowEvent,visible,titles,runMail};

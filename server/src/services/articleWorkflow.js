const db=require('../db');
const {publish,error,payload}=require('../lib/articlePublishing');
const {isAdminLike}=require('../middleware/auth');
const enabled=()=>process.env.PUBLISHING_ENABLED==='true';
const lockedStates=['submitted','approved','scheduled'];
async function assertEditable(c,d){
 const [[w]]=await c.query('SELECT state FROM article_workflows WHERE draft_id=? FOR UPDATE',[d.id]);
 if(w&&lockedStates.includes(w.state))throw error('请先撤回审核或取消发布计划，再编辑草稿。',409);
}
async function transaction(fn){const c=await db.getConnection();try{await c.beginTransaction();const result=await fn(c);await c.commit();return result;}catch(e){await c.rollback();throw e;}finally{c.release();}}
function schedule(value){
 if(typeof value!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(value))throw error('发布时间必须包含时区。');
 const at=Date.parse(value);if(!Number.isFinite(at)||at<=Date.now())throw error('请选择未来的发布时间。');return at;
}
async function change(id,actor,action,input){
 return transaction(async c=>{
  const [[user]]=await c.query('SELECT id,role,status FROM users WHERE id=? FOR UPDATE',[actor.id]);
  if(!user||user.status!=='active')throw error('账号不可用。',403);
  const [[d]]=await c.query('SELECT * FROM article_drafts WHERE id=? FOR UPDATE',[id]);
  if(!d||(!isAdminLike(user)&&Number(d.author_id)!==Number(user.id)))throw error('草稿不存在。',404);
  if(d.version!==input.version)throw error('草稿已变化，请刷新。',409);
  const [[w]]=await c.query('SELECT * FROM article_workflows WHERE draft_id=? FOR UPDATE',[id]);
  const data=typeof d.payload==='string'?JSON.parse(d.payload):d.payload;
  if(['approve','reject','schedule','publish'].includes(action)&&!isAdminLike(user))throw error('仅管理员可以审核或发布。',403);
  let state=w?.state||'draft',reason='',at=null,reviewer=w?.reviewer_id||null;
  if(action==='submit'){
   if(lockedStates.includes(state))throw error('当前版本已提交。',409);
   if(!data.title?.trim()||!data.content?.trim())throw error('请填写标题和正文。');
   state='submitted';reviewer=null;
   if(require('./engagement').enabled())await c.query('INSERT INTO engagement_workflow_cycles(draft_id,cycle) VALUES (?,1) ON DUPLICATE KEY UPDATE cycle=cycle+1',[id]);
  }else if(action==='cancel'){
   if(state==='scheduled'&&!isAdminLike(user))throw error('请联系管理员取消发布计划。',403);
   if(!lockedStates.includes(state)&&state!=='failed')throw error('当前没有待取消的审核或计划。',409);
   state='draft';reviewer=null;
  }else if(action==='approve'||action==='reject'){
   if(state!=='submitted')throw error('当前稿件不在待审状态。',409);
   if(w.draft_version!==d.version)throw error('待审版本不一致。',409);
   state=action==='approve'?'approved':'rejected';reviewer=user.id;
   reason=action==='reject'?String(input.reason||'').trim():'';
   if(action==='reject'&&(!reason||reason.length>1000))throw error('请填写不超过 1000 字的退回理由。');
  }else if(action==='schedule'||action==='publish'){
   if(!['approved','scheduled'].includes(state))throw error('请先审核通过当前版本。',409);
   if(w.draft_version!==d.version)throw error('已审核版本不一致。',409);
   const [[author]]=await c.query('SELECT status FROM users WHERE id=?',[d.author_id]);
   if(!author||author.status!=='active')throw error('作者账号不可用。',409);
   if(action==='schedule'){at=schedule(input.scheduled_at);state='scheduled';reviewer=user.id;}
   else{await publish(c,{...d,payload:payload(typeof w.snapshot==='string'?JSON.parse(w.snapshot):w.snapshot)},user);state='published';}
  }else throw error('无效操作。');
  await c.query('INSERT INTO article_workflows(draft_id,state,draft_version,snapshot,reviewer_id,reason,scheduled_at) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE state=VALUES(state),draft_version=VALUES(draft_version),snapshot=VALUES(snapshot),reviewer_id=VALUES(reviewer_id),reason=VALUES(reason),scheduled_at=VALUES(scheduled_at)',[id,state,d.version,JSON.stringify(data),reviewer,reason,at]);
  await require('./engagement').workflowEvent(c,d,state,reason,user.id);
  return {state,reason,scheduled_at:at};
 });
}
async function runDue(){
 if(!enabled())return;
 const [due]=await db.query("SELECT draft_id,scheduled_at,draft_version FROM article_workflows WHERE state='scheduled' AND scheduled_at<=? ORDER BY scheduled_at LIMIT 30",[Date.now()]);
 for(const job of due){
  try{await transaction(async c=>{
   const [[d]]=await c.query('SELECT * FROM article_drafts WHERE id=? FOR UPDATE',[job.draft_id]);
   const [[w]]=await c.query('SELECT * FROM article_workflows WHERE draft_id=? FOR UPDATE',[job.draft_id]);
   if(!w||w.state!=='scheduled'||Number(w.scheduled_at)>Date.now())return;
   if(!d||d.version!==w.draft_version)throw error('稿件版本已变化。',409);
   const [[reviewer]]=await c.query('SELECT id,role,status FROM users WHERE id=?',[w.reviewer_id]);
   const [[author]]=await c.query('SELECT status FROM users WHERE id=?',[d.author_id]);
   if(!reviewer||reviewer.status!=='active'||!isAdminLike(reviewer)||author?.status!=='active')throw error('作者或审核人权限已失效。',409);
   await publish(c,{...d,payload:payload(typeof w.snapshot==='string'?JSON.parse(w.snapshot):w.snapshot)},reviewer);
   await c.query("UPDATE article_workflows SET state='published',reason='',scheduled_at=NULL WHERE draft_id=?",[d.id]);
   await require('./engagement').workflowEvent(c,d,'published');
  });}catch(e){
   await transaction(async c=>{
    const [[d]]=await c.query('SELECT * FROM article_drafts WHERE id=? FOR UPDATE',[job.draft_id]);
    const reason=e.status?e.message:'发布失败，请检查链接冲突或服务状态后重新审核。';
    const [r]=await c.query("UPDATE article_workflows SET state='failed',reason=? WHERE draft_id=? AND state='scheduled' AND scheduled_at=? AND draft_version=?",[reason,job.draft_id,job.scheduled_at,job.draft_version]);
    if(r.affectedRows&&d)await require('./engagement').workflowEvent(c,d,'failed',reason,null,String(job.scheduled_at));
   });
  }
 }
}
module.exports={enabled,assertEditable,change,runDue,schedule};

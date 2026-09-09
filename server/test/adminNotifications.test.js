const test = require('node:test');
const assert = require('node:assert/strict');
test('real admin routes notify once after persisted changes, report mail failures truthfully, and keep editorial promotion atomic', async t => {
  process.env.JWT_SECRET='admin-notification-fixture-only';
  const db=require('../src/db'), nodemailer=require('nodemailer'), express=require('express'), jwt=require('jsonwebtoken');
  const users={1:{id:1,username:'站长',email:'owner@example.invalid',role:'owner',status:'active',can_comment:1},
    2:{id:2,username:'读者<script>',email:'reader@example.invalid',role:'user',status:'active',can_comment:1},
    3:{id:3,username:'管理员',email:'admin@example.invalid',role:'admin',status:'active',can_comment:1}};
  let comment={id:9,post_id:1,status:'pending',content:'测试评论',author_email:users[2].email,author_name:'读者',post_title:'技术手记'};
  let application={id:8,user_id:2,status:'pending'};
  const config={enabled:'true',smtp_host:'smtp.example.invalid',smtp_user:'fake',smtp_pass:'fake',smtp_from:'mooncci <sender@example.invalid>',site_url:'https://mooncci.site'};
  const sent=[];let mailFailure=false,conflict=false,failReview=false,committed=true;
  t.mock.method(nodemailer,'createTransport',()=>({sendMail:async mail=>{
    assert.equal(committed,true,'SMTP must run after transaction commit');
    if(mailFailure)throw Error('SMTP failure with private details');sent.push(mail);return {messageId:'test'};
  }}));
  async function query(sql,args=[]) {
    if(sql.startsWith('INSERT INTO auth_invalidations'))return [{affectedRows:1}];
    if(sql.includes('FROM site_settings'))return [[{setting_value:JSON.stringify(config)}]];
    if(sql.includes('FROM users'))return [[users[Number(args[0])]].filter(Boolean)];
    if(sql.includes('FROM comments c'))return [[{...comment}]];
    if(sql.includes('FROM editor_applications'))return [[{...application}]];
    if(sql.startsWith('UPDATE users SET role=?, status=?')){
      if(conflict){conflict=false;return [{affectedRows:0}];}
      const user=users[Number(args[3])];
      if(user.role!==args[4]||user.status!==args[5]||user.can_comment!==args[6])return [{affectedRows:0}];
      Object.assign(user,{role:args[0],status:args[1],can_comment:args[2]});return [{affectedRows:1}];
    }
    if(sql.startsWith('UPDATE comments SET status=')){
      if(comment.status!==args[2])return [{affectedRows:0}];comment.status=args[0];return [{affectedRows:1}];
    }
    if(sql.startsWith('UPDATE users SET role="editor"')){users[Number(args[0])].role='editor';return [{affectedRows:1}];}
    if(sql.startsWith('UPDATE editor_applications')){if(failReview)throw Error('Review write failed');application.status=args[0];return [{affectedRows:1}];}
    throw Error('Unexpected SQL: '+sql);
  }
  // Return detached rows, just as mysql does; updates cannot mutate the before snapshot.
  t.mock.method(db,'query',async(...args)=>structuredClone(await query(...args)));
  t.mock.method(db,'getConnection',async()=>{
    let before;
    return {beginTransaction:async()=>{before={users:structuredClone(users),application:structuredClone(application)};committed=false;},
      query:async(...args)=>structuredClone(await query(...args)),commit:async()=>{committed=true;},
      rollback:async()=>{for(const id of Object.keys(users))users[id]=before.users[id];application=before.application;committed=true;},release:()=>{}};
  });
  const app=express();app.use(express.json());app.use('/admin',require('../src/routes/admin'));app.use((e,q,r,n)=>r.status(500).json({message:'保存失败'}));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await db.end();});
  const base=`http://127.0.0.1:${server.address().port}`;
  const put=async(path,body,id=1)=>{const res=await fetch(base+'/admin'+path,{method:'PUT',headers:{'Content-Type':'application/json',...(id?{Cookie:`mooncci_token=${jwt.sign({id},process.env.JWT_SECRET)}`}:{})},body:JSON.stringify(body)});return {status:res.status,body:await res.json()};};
  assert.equal((await put('/users/2',{role:'editor'},null)).status,401);
  assert.equal((await put('/users/2',{role:'editor'},2)).status,403);
  assert.equal((await put('/users/1',{role:'user'},3)).status,403);
  const first=await put('/users/2',{role:'editor'});
  assert.equal(first.body.notification.status,'sent');assert.equal(users[2].role,'editor');assert.equal(sent.length,1);
  assert.equal(sent[0].subject,'[mooncci] 账号权限已更新');assert.equal(sent[0].to,'reader@example.invalid');
  assert.match(sent[0].html,/普通用户 → 编辑/);assert.match(sent[0].html,/data-mail-theme="mooncci"/);
  assert.match(sent[0].html,/data-mail-button="true"/);assert.match(sent[0].html,/data-mail-fallback="true"/);assert.doesNotMatch(sent[0].html,/<script>/);
  assert.equal((await put('/users/2',{role:'editor'})).body.notification.status,'not_needed');assert.equal(sent.length,1);
  await put('/users/2',{status:'disabled'});assert.equal(sent.length,2);assert.match(sent[1].html,/暂时无法登录/);
  config.enabled='false';const disabled=await put('/users/2',{status:'active'});assert.equal(disabled.body.notification.status,'skipped');assert.doesNotMatch(disabled.body.message,/已提交发送/);assert.equal(users[2].status,'active');
  config.enabled='true';mailFailure=true;const failed=await put('/users/2',{can_comment:0});assert.equal(failed.body.notification.status,'failed');assert.equal(users[2].can_comment,0);assert.doesNotMatch(failed.body.message,/private details/);mailFailure=false;
  users[2].email='';assert.equal((await put('/users/2',{can_comment:1})).body.notification.status,'skipped');users[2].email='reader@example.invalid';
  conflict=true;assert.equal((await put('/users/2',{role:'user'})).status,409);assert.equal(sent.length,2);
  const approved=await put('/comments/9',{status:'visible'});assert.equal(approved.body.notification.status,'sent');assert.equal(sent.at(-1).subject,'[mooncci] 评论审核通过');
  const count=sent.length;await put('/comments/9',{status:'visible'});assert.equal(sent.length,count);
  await put('/comments/9',{status:'hidden'});assert.equal(sent.length,count);
  comment.status='pending';config.enabled='false';const skipped=await put('/comments/9',{status:'rejected'});assert.equal(skipped.body.notification.status,'skipped');assert.doesNotMatch(skipped.body.message,/已通知用户|已提交发送/);
  config.enabled='true';comment.status='pending';mailFailure=true;const rejected=await put('/comments/9',{status:'visible'});assert.equal(rejected.body.notification.status,'failed');assert.equal(comment.status,'visible');mailFailure=false;
  users[2].role='user';const promotion=await put('/editor-applications/8',{status:'approved'});assert.equal(promotion.status,200);assert.equal(promotion.body.notification.status,'sent');assert.equal(users[2].role,'editor');assert.equal(application.status,'approved');
  const promotedCount=sent.length;assert.equal((await put('/editor-applications/8',{status:'approved'})).status,400);assert.equal(sent.length,promotedCount);
  application.status='pending';users[2].role='user';failReview=true;assert.equal((await put('/editor-applications/8',{status:'approved'})).status,500);
  assert.equal(users[2].role,'user');assert.equal(application.status,'pending');assert.equal(sent.length,promotedCount);
});

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
test('phase two private data, durable events, mail gating and stale progress',{skip:process.env.ENGAGEMENT_INTEGRATION!=='true'},async t=>{
 const name='mooncci_qa_engagement_'+process.pid;
 Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:process.env.TEST_DB_PORT||'33079',DB_USER:'root',DB_PASSWORD:'',DB_NAME:name,JWT_SECRET:'engagement-test-secret-not-for-production',SITE_URL:'https://mooncci.site',PUBLISHING_ENABLED:'true',ENGAGEMENT_ENABLED:'true',MAIL_ENABLED:'false',NEWSLETTER_DELIVERY_ENABLED:'false'});
 const setup=await require('mysql2/promise').createConnection({host:'127.0.0.1',port:Number(process.env.TEST_DB_PORT||33079),user:'root',multipleStatements:true});
 await setup.query('CREATE DATABASE '+name+' CHARACTER SET utf8mb4');await setup.query('USE '+name);
 await setup.query(fs.readFileSync(path.join(__dirname,'../database/schema.sql'),'utf8'));
 await setup.query(fs.readFileSync(path.join(__dirname,'../database/migrations/202609090002_auth_revocation.sql'),'utf8'));
 await setup.query("CREATE TABLE schema_migrations(filename VARCHAR(255) PRIMARY KEY,checksum CHAR(64) NOT NULL)");
 await setup.query("INSERT INTO schema_migrations VALUES ('historical.sql',?)",['a'.repeat(64)]);
 const {spawnSync}=require('node:child_process');
 const fixtures=path.resolve(__dirname,'../../.cache');fs.mkdirSync(fixtures,{recursive:true});
 const live=fs.mkdtempSync(path.join(fixtures,'engagement-migration-'));
 t.after(()=>{assert.ok(live.startsWith(fixtures+path.sep+'engagement-migration-'));fs.rmSync(live,{recursive:true,force:true});});
 fs.writeFileSync(path.join(live,'.env'),'# Test environment only\n');
 for(const [file,target] of [['dotenv/index.js','dotenv'],['mysql2/promise.js','mysql2/promise']]){
 const dest=path.join(live,'node_modules',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,'module.exports=require('+JSON.stringify(require.resolve(target))+');');
 }
 for(let i=0;i<2;i++){const r=spawnSync(process.execPath,[path.join(__dirname,'../scripts/migrate-engagement.js'),live],{env:process.env,encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
 assert.equal((await setup.query("SELECT checksum FROM schema_migrations WHERE filename='historical.sql'"))[0][0].checksum,'a'.repeat(64));
 const db=require('../src/db'),jwt=require('jsonwebtoken'),service=require('../src/services/engagement');
 const ids={};for(const role of ['user','editor','admin']){const [r]=await db.query('INSERT INTO users(username,email,password_hash,role) VALUES (?,?,?,?)',[role,role+'@example.test','unused',role]);ids[role]=r.insertId;}
 const app=require('../src/index'),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(async()=>{await new Promise(r=>server.close(r));await db.end();await require('../src/platformDb').end();await setup.query('DROP DATABASE '+name);await setup.end();});
 const request=(url,method='GET',body,role='user')=>fetch('http://127.0.0.1:'+server.address().port+'/api'+url,{method,headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest',Origin:'https://mooncci.site',Cookie:role?'mooncci_token='+jwt.sign({id:ids[role],sessionStartedAt:Date.now()},process.env.JWT_SECRET):''},...(body?{body:JSON.stringify(body)}:{})});
 const ok=async(...args)=>{const r=await request(...args),body=await r.json();assert.equal(r.status,200,JSON.stringify(body));return body;};
 const [post]=await db.query("INSERT INTO posts(title,slug,content,status,author_id) VALUES ('Reading','reading','## Heading\\nBody','published',?)",[ids.user]);const id=post.insertId;
 await db.query('INSERT INTO article_bookmarks(user_id,post_id) VALUES (?,?)',[ids.user,id]);
 // Migration is idempotent and existing bookmarks survive.
 const migration=fs.readFileSync(path.join(__dirname,'../database/migrations/202609220001_engagement.sql'),'utf8');
 await setup.query(migration);await setup.query(migration);
 assert.equal((await ok('/bookmarks')).total,1);
 const f=await ok('/bookmark-folders','POST',{name:'学习'});
 assert.equal((await request('/bookmark-folders/'+f.id,'PUT',{name:'Steal'},'editor')).status,404);
 assert.equal((await request('/bookmark-folders/move/'+id,'PUT',{folder_id:f.id},'editor')).status,404);
 await ok('/bookmark-folders/move/'+id,'PUT',{folder_id:f.id});
 assert.equal((await ok('/bookmarks?folder='+f.id)).total,1);
 assert.equal((await ok('/bookmarks?search=Reading')).total,1);
 await ok('/bookmark-folders/'+f.id,'DELETE');
 assert.equal((await ok('/bookmarks?folder=0')).total,1);
 const initial=await ok('/engagement/history/'+id);
 const progress={anchor:'heading-0',progress:.5,revision:0,epoch:initial.epoch};
 await ok('/engagement/history/'+id,'PUT',progress);
 assert.equal((await request('/engagement/history/'+id,'PUT',progress)).status,409);
 assert.equal((await ok('/engagement/history','GET',null,'editor')).items.length,0);
 await ok('/engagement/history/'+id,'DELETE');
 assert.equal((await request('/engagement/history/'+id,'PUT',{...progress,revision:0})).status,409);
 const fresh=await ok('/engagement/history/'+id);await ok('/engagement/history/'+id,'PUT',{...progress,epoch:fresh.epoch});
 await ok('/engagement/preferences','PUT',{history_enabled:false});
 assert.equal((await request('/engagement/history/'+id,'PUT',{...progress,epoch:fresh.epoch,revision:1})).status,409);
 assert.equal((await request('/engagement/preferences','PUT',{comment_email:true})).status,400);
 const p=await service.preferences(db,ids.user);assert.equal(p.comment_email,0);assert.equal(p.reply_email,0);
 await db.query('UPDATE engagement_preferences SET verified_email=?,comment_email=1,reply_email=1 WHERE user_id=?',['user@example.test',ids.user]);
 const make=async(actor,recipient,status='visible')=>{const [r]=await db.query('INSERT INTO comments(post_id,user_id,reply_to_user_id,content,status) VALUES (?,?,?,?,?)',[id,ids[actor],recipient,'private test comment',status]);return r.insertId;};
 const own=await make('user',ids.user);await service.transaction(c=>service.commentEvent(c,own));assert.equal((await ok('/engagement/notifications')).total,0);
 const pending=await make('editor',ids.user,'pending');await service.transaction(c=>service.commentEvent(c,pending));assert.equal((await ok('/engagement/notifications')).total,0);
 await ok('/admin/comments/'+pending,'PUT',{status:'visible'},'admin');
 await service.transaction(c=>service.commentEvent(c,pending));
 let n=await ok('/engagement/notifications');assert.equal(n.items.length,1);assert.equal(n.items[0].kind,'reply');assert.equal(n.unread,1);
 await ok('/engagement/notifications/read','PUT',{id:n.items[0].id},'editor');assert.equal((await ok('/engagement/notifications')).unread,1);
 let sent=0;await service.runMail(async()=>{sent++;return {sent:true};});await service.runMail(async()=>{sent++;return {sent:true};});assert.equal(sent,1);
 const later=await make('editor',null);await service.transaction(c=>service.commentEvent(c,later));await ok('/engagement/preferences','PUT',{comment_email:false});await service.runMail(async()=>{sent++;return {sent:true};});assert.equal(sent,1);
 const hidden=await make('editor',ids.user);await service.transaction(c=>service.commentEvent(c,hidden));await db.query("UPDATE comments SET status='hidden' WHERE id=?",[hidden]);await service.runMail(async()=>{sent++;return {sent:true};});assert.equal(sent,1);
 assert.equal((await ok('/engagement/notifications')).items[0].available,false);
 await db.query("UPDATE posts SET status='draft' WHERE id=?",[id]);
 assert.equal((await ok('/engagement/history')).items.length,0);
 const unavailable=(await ok('/bookmarks')).items[0];assert.equal(unavailable.available,false);assert.equal(unavailable.title,undefined);
 assert.ok((await ok('/engagement/notifications')).items.every(x=>!x.available&&!x.message));
 assert.equal((await request('/engagement/history','GET',null,null)).status,401);
 assert.match((await request('/engagement/notifications')).headers.get('cache-control'),/no-store/);
 // A failed transaction cannot leak a notification.
 await assert.rejects(service.transaction(async c=>{await service.notify(c,{userId:ids.user,key:'rollback',kind:'approved'});throw Error('rollback');}));
 assert.equal((await db.query("SELECT COUNT(*) n FROM account_notifications WHERE event_key='rollback'"))[0][0].n,0);

 // Approval, rejection and scheduled publication notify the contributor inside the transaction.
 await db.query("UPDATE posts SET status='published' WHERE id=?",[id]);
 const draft=await ok('/article-drafts','POST',{id:crypto.randomUUID(),payload:{title:'Queued article',slug:'queue-'+crypto.randomUUID(),content:'Test'}});
 await ok('/publishing/'+draft.id+'/submit','POST',{version:draft.version});
 await ok('/publishing/'+draft.id+'/reject','POST',{version:draft.version,reason:'补充来源'},'admin');
 assert.ok((await ok('/engagement/notifications')).items.some(x=>x.kind==='rejected'&&x.message==='补充来源'));
 await ok('/publishing/'+draft.id+'/submit','POST',{version:draft.version});
 await ok('/publishing/'+draft.id+'/approve','POST',{version:draft.version},'admin');
 await ok('/publishing/'+draft.id+'/schedule','POST',{version:draft.version,scheduled_at:'2099-01-01T12:00:00Z'},'admin');
 await db.query('UPDATE article_workflows SET scheduled_at=1 WHERE draft_id=?',[draft.id]);
 await require('../src/services/articleWorkflow').runDue();
 assert.equal((await db.query("SELECT COUNT(*) n FROM account_notifications WHERE draft_id=? AND kind='published'",[draft.id]))[0][0].n,1);
 await require('../src/services/articleWorkflow').runDue();
 assert.equal((await db.query("SELECT COUNT(*) n FROM account_notifications WHERE draft_id=? AND kind='published'",[draft.id]))[0][0].n,1);
 // Stale verification cannot verify a changed login email.
 await db.query('UPDATE engagement_preferences SET verify_hash=?,verify_expires=?,verify_attempts=0 WHERE user_id=?',[crypto.createHash('sha256').update('old@example.test:123456').digest('hex'),Date.now()+60000,ids.user]);
 assert.equal((await request('/engagement/verify-email/confirm','POST',{code:'123456'})).status,400);
 // An unverified address never gets mail, even if preferences were previously enabled.
 const changed=await make('editor',ids.user);await service.transaction(c=>service.commentEvent(c,changed));
 await db.query("UPDATE engagement_preferences SET verified_email='old@example.test' WHERE user_id=?",[ids.user]);
 await service.runMail(async()=>{sent++;return {sent:true};});assert.equal(sent,1);
 // Expired history is removed by worker retention.
 await db.query('UPDATE article_reading_history SET updated_at=1 WHERE user_id=?',[ids.user]);await service.runMail(async()=>({sent:true}));
 assert.equal((await db.query('SELECT COUNT(*) n FROM article_reading_history WHERE user_id=?',[ids.user]))[0][0].n,0);
 // Public comment creation and notification commit together.
 await ok('/comments/post/'+id,'POST',{content:'A fresh public comment'},'editor');
 const [[created]]=await db.query('SELECT id FROM comments WHERE post_id=? ORDER BY id DESC LIMIT 1',[id]);
 assert.equal((await db.query('SELECT COUNT(*) n FROM account_notifications WHERE comment_id=?',[created.id]))[0][0].n,1);
 // Concurrent worker claims never deliver the same queued row in parallel; a failed attempt retries.
 await db.query("UPDATE engagement_preferences SET verified_email='user@example.test',reply_email=1 WHERE user_id=?",[ids.user]);
 const retry=await make('editor',ids.user);await service.transaction(c=>service.commentEvent(c,retry));
 const [[notification]]=await db.query('SELECT id FROM account_notifications WHERE comment_id=?',[retry]);
 await service.runMail(async()=>{throw Error('simulated SMTP failure');});
 assert.equal((await db.query('SELECT state FROM notification_mail_jobs WHERE notification_id=?',[notification.id]))[0][0].state,'pending');
 await db.query('UPDATE notification_mail_jobs SET available_at=0 WHERE notification_id=?',[notification.id]);
 let concurrentSends=0;await Promise.all([service.runMail(async()=>{concurrentSends++;return {sent:true};}),service.runMail(async()=>{concurrentSends++;return {sent:true};})]);assert.equal(concurrentSends,1);
 process.env.ENGAGEMENT_ENABLED='false';assert.equal((await request('/engagement/history')).status,404);assert.equal((await ok('/bookmarks')).total,1);
});


const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),crypto=require('crypto');
test('phase 1: ownership, review snapshots, scheduler recovery and series visibility',{skip:process.env.PUBLISHING_INTEGRATION!=='true'},async t=>{
 const name='mooncci_qa_publishing_'+process.pid;
 Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:process.env.TEST_DB_PORT||'33079',DB_USER:'root',DB_PASSWORD:'',DB_NAME:name,JWT_SECRET:'publishing-test-secret-only-more-than-32-chars',SITE_URL:'https://mooncci.site',PUBLISHING_ENABLED:'true',MAIL_ENABLED:'false',NEWSLETTER_DELIVERY_ENABLED:'false',GITHUB_SYNC_ENABLED:'false'});
 const setup=await require('mysql2/promise').createConnection({host:'127.0.0.1',port:Number(process.env.DB_PORT),user:'root',multipleStatements:true});
 await setup.query('CREATE DATABASE '+name+' CHARACTER SET utf8mb4');await setup.query('USE '+name);
 await setup.query(fs.readFileSync(path.join(__dirname,'../database/schema.sql'),'utf8'));
 await setup.query(fs.readFileSync(path.join(__dirname,'../database/migrations/202609090002_auth_revocation.sql'),'utf8'));

 await setup.query("CREATE TABLE schema_migrations (filename VARCHAR(255) PRIMARY KEY,checksum CHAR(64) NOT NULL)");
 await setup.query("INSERT INTO schema_migrations VALUES ('historical-fixture.sql',?)",['a'.repeat(64)]);
 for(const table of ['article_series_posts','article_series','article_workflows'])await setup.query('DROP TABLE '+table);
 const {spawnSync}=require('child_process');
 const fixtures=path.resolve(__dirname,'../../.cache');fs.mkdirSync(fixtures,{recursive:true});
 const live=fs.mkdtempSync(path.join(fixtures,'publishing-migration-'));
 t.after(()=>{assert.ok(live.startsWith(fixtures+path.sep+'publishing-migration-'));fs.rmSync(live,{recursive:true,force:true});});
 fs.writeFileSync(path.join(live,'.env'),'# Isolated test environment; connection comes from test env.\n');
 for(const [file,target] of [['dotenv/index.js','dotenv'],['mysql2/promise.js','mysql2/promise']]){
  const destination=path.join(live,'node_modules',file);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,'module.exports=require('+JSON.stringify(require.resolve(target))+');');
 }

 for(let i=0;i<2;i++){const result=spawnSync(process.execPath,[path.join(__dirname,'../scripts/migrate-publishing.js'),live],{env:process.env,encoding:'utf8'});assert.equal(result.status,0,result.stderr);}
 assert.equal((await setup.query("SELECT checksum FROM schema_migrations WHERE filename='historical-fixture.sql'"))[0][0].checksum,'a'.repeat(64));
 const db=require('../src/db'),jwt=require('jsonwebtoken'),workflow=require('../src/services/articleWorkflow');
 const users={};for(const role of ['user','editor','admin','owner']){const [r]=await db.query('INSERT INTO users(username,email,password_hash,role) VALUES (?,?,?,?)',[role,role+'@example.test','unused',role]);users[role]=r.insertId;}
 const cookie=role=>'mooncci_token='+jwt.sign({id:users[role],sessionStartedAt:Date.now()},process.env.JWT_SECRET);
 const server=require('../src/index').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(async()=>{await new Promise(r=>server.close(r));await db.end();await require('../src/platformDb').end();await setup.query('DROP DATABASE '+name);await setup.end();});
 const request=(url,method='GET',body,role='user')=>fetch('http://127.0.0.1:'+server.address().port+'/api'+url,{method,headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest',Origin:'https://mooncci.site',Cookie:role?cookie(role):''},...(body?{body:JSON.stringify(body)}:{})});
 async function ok(url,method,body,role){const r=await request(url,method,body,role),data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;}
 async function draft(role='user'){return ok('/article-drafts','POST',{id:crypto.randomUUID(),payload:{title:'Reviewed article',content:'Original public content',slug:'test-'+crypto.randomUUID()}},role);}
 const act=(d,action,role='admin',extra={})=>ok('/publishing/'+d.id+'/'+action,'POST',{version:d.version,...extra},role);
 const status=(d,action,role,extra={})=>request('/publishing/'+d.id+'/'+action,'POST',{version:d.version,...extra},role).then(r=>r.status);
 let d=await draft();
 assert.equal((await request('/article-drafts/'+d.id,'GET',null,'editor')).status,404);
 assert.equal((await request('/article-drafts/'+d.id,'GET',null,null)).status,401);
 assert.match((await request('/article-drafts/'+d.id)).headers.get('cache-control'),/no-store/);
 assert.equal((await request('/publishing/queue')).status,403);
 assert.equal((await request('/article-drafts/'+d.id+'/publish','POST',{version:d.version})).status,403);
 assert.equal((await request('/posts','POST',{title:'Bypass',content:'x'},'editor')).status,403);
 await act(d,'submit','user');
 assert.equal(await status(d,'approve','user'),403);
 assert.equal((await request('/article-drafts/'+d.id,'PUT',{version:d.version,payload:{title:'Mutation'}})).status,409);
 assert.equal((await request('/article-drafts/'+d.id,'DELETE',{version:d.version})).status,409);
 assert.equal(await status(d,'reject','admin',{reason:''}),400);
 await act(d,'reject','admin',{reason:'Please clarify sources'});
 let reviewed=await ok('/article-drafts/'+d.id);assert.equal(reviewed.workflow.reason,'Please clarify sources');
 await act(d,'submit','user');await act(d,'cancel','user');
 await act(d,'submit','user');await act(d,'approve');
 assert.equal(await status(d,'schedule','admin',{scheduled_at:'2099-01-01T12:00'}),400);
 await act(d,'publish');
 d=await ok('/article-drafts/'+d.id);
 assert.equal((await ok('/posts/'+d.post_id,'GET',null,null)).content,'Original public content');
 d=await ok('/article-drafts/'+d.id,'PUT',{version:d.version,payload:{...d.payload,content:'Reviewed replacement'}});
 assert.equal(d.workflow.state,'draft');
 await act(d,'submit','user');await act(d,'approve');
 assert.equal((await ok('/posts/'+d.post_id,'GET',null,null)).content,'Original public content');
 await act(d,'schedule','admin',{scheduled_at:'2099-01-01T12:00:00+08:00'});
 assert.equal(await status(d,'cancel','user'),403);
 assert.equal((await request('/posts/'+d.post_id,'DELETE',null,'admin')).status,409);
 await act(d,'schedule','admin',{scheduled_at:'2099-01-02T12:00:00+08:00'});
 await act(d,'cancel');
 await workflow.runDue();
 assert.equal((await ok('/posts/'+d.post_id,'GET',null,null)).content,'Original public content');
 await act(d,'submit','user');await act(d,'approve');await act(d,'schedule','admin',{scheduled_at:'2099-01-01T12:00:00Z'});
 await db.query('UPDATE article_workflows SET scheduled_at=? WHERE draft_id=?',[Date.now()-60000,d.id]);
 await Promise.all([workflow.runDue(),workflow.runDue()]);
 const [[published]]=await db.query('SELECT content,version FROM posts WHERE id=?',[d.post_id]);
 assert.equal(published.content,'Reviewed replacement');assert.equal(published.version,2);
 await workflow.runDue();assert.equal((await db.query('SELECT version FROM posts WHERE id=?',[d.post_id]))[0][0].version,2);
 async function due(){const x=await draft();await act(x,'submit','user');await act(x,'approve');await act(x,'schedule','admin',{scheduled_at:'2099-01-01T12:00:00Z'});await db.query('UPDATE article_workflows SET scheduled_at=1 WHERE draft_id=?',[x.id]);return x;}
 const disabled=await due();await db.query("UPDATE users SET status='disabled' WHERE id=?",[users.user]);await workflow.runDue();await db.query("UPDATE users SET status='active' WHERE id=?",[users.user]);
 assert.equal((await ok('/article-drafts/'+disabled.id)).workflow.state,'failed');
 const revoked=await due();await db.query("UPDATE users SET role='user' WHERE id=?",[users.admin]);await workflow.runDue();await db.query("UPDATE users SET role='admin' WHERE id=?",[users.admin]);
 assert.equal((await ok('/article-drafts/'+revoked.id)).workflow.state,'failed');
 const conflict=await due();await db.query('UPDATE article_drafts SET version=version+1 WHERE id=?',[conflict.id]);await workflow.runDue();
 assert.equal((await ok('/article-drafts/'+conflict.id)).workflow.state,'failed');
 const own=await draft('owner');await ok('/article-drafts/'+own.id+'/publish','POST',{version:own.version},'owner');
 const ownPublished=await ok('/article-drafts/'+own.id,'GET',null,'owner');
 const mine=await ok('/article-drafts?mine=true','GET',null,'owner');assert.ok(mine.items.every(x=>x.id===own.id));
 const series=await ok('/series','POST',{title:'Test series',slug:'test-series',description:'Ordered essays'},'admin');
 assert.equal((await request('/series/'+series.id+'/articles','PUT',{post_ids:[d.post_id]})).status,403);
 await ok('/series/'+series.id+'/articles','PUT',{post_ids:[ownPublished.post_id,d.post_id]},'admin');
 const pub=await ok('/series/test-series','GET',null,null);assert.deepEqual(pub.items.map(p=>p.id),[ownPublished.post_id,d.post_id]);
 const nav=await ok('/series/article/'+d.post_id,'GET',null,null);assert.equal(nav.previous.id,ownPublished.post_id);assert.equal(nav.next,null);
 await db.query("UPDATE posts SET status='draft' WHERE id=?",[ownPublished.post_id]);
 assert.deepEqual((await ok('/series/test-series','GET',null,null)).items.map(p=>p.id),[d.post_id]);
 assert.equal(await ok('/series/article/'+ownPublished.post_id,'GET',null,null),null);
 await ok('/series/'+series.id,'DELETE',null,'admin');assert.equal((await request('/posts/'+d.post_id,'GET',null,null)).status,200);
 await act(disabled,'cancel');await ok('/article-drafts/'+disabled.id,'DELETE',{version:disabled.version});assert.equal((await db.query('SELECT * FROM article_workflows WHERE draft_id=?',[disabled.id]))[0].length,0);
 await ok('/article-drafts/'+d.id,'DELETE',{version:d.version});
 const reset=await ok('/article-drafts/'+d.id);assert.equal(reset.payload.content,'Reviewed replacement');assert.equal(reset.dirty,0);
 for(const role of ['user','editor'])await db.query('INSERT INTO media_assets(filename,url,uploaded_by) VALUES (?,?,?)',[role+'.png','/api/uploads/'+role+'.png',users[role]]);
 const media=await ok('/upload/media?page=1');assert.equal(media.total,1);assert.equal(media.items[0].filename,'user.png');
 assert.equal((await request('/upload/media/editor.png','DELETE')).status,403);
 const [revision]=await db.query('SELECT id FROM article_revisions WHERE post_id=? LIMIT 1',[d.post_id]);
 const edit=await ok('/article-drafts/'+d.id);
 await act(edit,'submit','user');
 assert.equal((await request('/article-drafts/'+d.id+'/revisions/'+revision[0].id+'/restore','POST',{version:edit.version})).status,409);

 await act(edit,'approve');await act(edit,'schedule','admin',{scheduled_at:'2099-01-01T12:00:00Z'});
 await db.query('UPDATE article_workflows SET scheduled_at=1 WHERE draft_id=?',[edit.id]);
 await db.query('UPDATE posts SET version=version+1 WHERE id=?',[edit.post_id]);
 await workflow.runDue();const failed=await ok('/article-drafts/'+edit.id);
 assert.equal(failed.workflow.state,'failed');assert.match(failed.workflow.reason,/新版本/);
 assert.equal((await ok('/posts/'+edit.post_id,'GET',null,null)).content,'Reviewed replacement');

});

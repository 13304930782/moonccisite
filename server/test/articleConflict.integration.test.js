const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),crypto=require('crypto');
test('conflict resolution checks both observed versions and preserves replaced contents',{skip:process.env.CONFLICT_INTEGRATION!=='true'},async t=>{
 const name='mooncci_qa_conflict_'+process.pid;
 Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:process.env.TEST_DB_PORT||'33079',DB_USER:'root',DB_PASSWORD:'',DB_NAME:name,JWT_SECRET:'conflict-local-only-test-secret-32-characters',SITE_URL:'https://mooncci.site',PUBLISHING_ENABLED:'true',MAIL_ENABLED:'false',ENGAGEMENT_ENABLED:'false'});
 const setup=await require('mysql2/promise').createConnection({host:'127.0.0.1',port:Number(process.env.DB_PORT),user:'root',multipleStatements:true});
 await setup.query('CREATE DATABASE '+name+' CHARACTER SET utf8mb4');await setup.query('USE '+name);await setup.query(fs.readFileSync(path.join(__dirname,'../database/schema.sql'),'utf8'));await setup.query(fs.readFileSync(path.join(__dirname,'../database/migrations/202609090002_auth_revocation.sql'),'utf8'));
 const db=require('../src/db'),jwt=require('jsonwebtoken'),users={};for(const role of ['owner','user','editor']){const [r]=await db.query('INSERT INTO users(username,email,password_hash,role) VALUES (?,?,?,?)',[role,role+'@example.test','unused',role]);users[role]=r.insertId;}
 const server=require('../src/index').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{await new Promise(r=>server.close(r));await db.end();await require('../src/platformDb').end();await setup.query('DROP DATABASE '+name);await setup.end();});
 const request=async(url,method='GET',body,role='owner')=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api'+url,{method,headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest',Origin:'https://mooncci.site',Cookie:role?'mooncci_token='+jwt.sign({id:users[role],sessionStartedAt:Date.now()},process.env.JWT_SECRET):''},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
 const ok=async(...args)=>{const r=await request(...args);assert.equal(r.status,200,JSON.stringify(r.data));return r.data;};
 const current={title:'Current browser content',content:'Browser text',slug:'conflict-post',tags:[]};
 let d=await ok('/article-drafts','POST',{id:crypto.randomUUID(),payload:current});d=await ok('/article-drafts/'+d.id+'/publish','POST',{version:d.version});
 await db.query('UPDATE posts SET content="New public text",version=version+1 WHERE id=?',[d.post_id]);
 let comparison=await ok('/article-drafts/'+d.id+'/conflict');assert.equal(comparison.post.payload.content,'New public text');assert.equal(comparison.draft.payload.content,'Browser text');
 assert.equal((await request('/article-drafts/'+d.id+'/conflict','GET',null,'user')).status,404);
 assert.equal((await request('/article-drafts/'+d.id+'/conflict','GET',null,null)).status,401);
 const route='/article-drafts/'+d.id+'/resolve-conflict';
 const choice={choice:'publish-current',payload:{...current,content:'Chosen local text'},draft_version:comparison.draft.version,post_version:comparison.post.version};
 assert.equal((await request(route,'POST',{...choice,post_version:1})).status,409);
 assert.equal((await request(route,'POST',{...choice,draft_version:undefined})).status,409);
 d=await ok(route,'POST',choice);let [[post]]=await db.query('SELECT * FROM posts WHERE id=?',[d.post_id]);assert.equal(post.content,'Chosen local text');assert.equal(d.base_version,post.version);
 assert.equal((await request(route,'POST',choice)).status,409);
 let [history]=await db.query('SELECT payload FROM article_revisions WHERE post_id=?',[d.post_id]);assert.ok(history.some(r=>JSON.parse(typeof r.payload==='string'?r.payload:JSON.stringify(r.payload)).content==='New public text'));
 comparison=await ok('/article-drafts/'+d.id+'/conflict');const adopt={choice:'adopt-post',payload:{...current,content:'Unsaved browser text'},draft_version:comparison.draft.version,post_version:comparison.post.version};
 await db.query('UPDATE article_drafts SET version=version+1 WHERE id=?',[d.id]);assert.equal((await request(route,'POST',adopt)).status,409);
 comparison=await ok('/article-drafts/'+d.id+'/conflict');d=await ok(route,'POST',{...adopt,draft_version:comparison.draft.version});assert.equal(d.payload.content,'Chosen local text');
 [history]=await db.query('SELECT payload FROM article_revisions WHERE post_id=?',[d.post_id]);assert.ok(history.some(r=>(typeof r.payload==='string'?JSON.parse(r.payload):r.payload).content==='Unsaved browser text'));
 // A draft-only conflict must not grant a contributor direct publication rights.
 let own=await ok('/article-drafts','POST',{id:crypto.randomUUID(),payload:{...current,slug:'contributor'}},'user');const ownRoute='/article-drafts/'+own.id+'/resolve-conflict';
 const ownChoice={choice:'publish-current',payload:own.payload,draft_version:own.version,post_version:null};assert.equal((await request(ownRoute,'POST',ownChoice,'user')).status,403);
 own=await ok(ownRoute,'POST',{...ownChoice,choice:'keep-current'},'user');assert.equal(own.post_id,null);assert.equal(own.workflow.state,'draft');
 await db.query("INSERT INTO article_workflows(draft_id,state,draft_version,snapshot) VALUES (?,'submitted',1,'{}') ON DUPLICATE KEY UPDATE state='submitted'",[own.id]);assert.equal((await request(ownRoute,'POST',{...ownChoice,choice:'keep-current',draft_version:own.version},'user')).status,409);
 // Adopting a server draft never silently aligns its public base version.
 await db.query('UPDATE posts SET version=version+1 WHERE id=?',[d.post_id]);comparison=await ok('/article-drafts/'+d.id+'/conflict');const oldBase=comparison.draft.base_version;
 d=await ok(route,'POST',{choice:'adopt-draft',payload:current,draft_version:comparison.draft.version,post_version:comparison.post.version});assert.equal(d.base_version,oldBase);assert.equal((await request('/article-drafts/'+d.id+'/publish','POST',{version:d.version})).status,409);
 // Concurrent choices of the same comparison can commit only once.
 comparison=await ok('/article-drafts/'+d.id+'/conflict');
 const concurrent={choice:'keep-current',payload:current,draft_version:comparison.draft.version,post_version:comparison.post.version};
 const outcomes=await Promise.all([request(route,'POST',concurrent),request(route,'POST',concurrent)]);assert.deepEqual(outcomes.map(x=>x.status).sort(),[200,409]);
});

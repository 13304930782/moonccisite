const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),crypto=require('crypto');
test('revision history transactions, retention, authorization and restore',{skip:process.env.REVISION_INTEGRATION!=='true'},async t=>{
 const name=`mooncci_qa_revisions_${process.pid}`;
 Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:process.env.TEST_DB_PORT||'33079',DB_USER:'root',DB_PASSWORD:'',DB_NAME:name,JWT_SECRET:'draft-test-secret-only-more-than-32-chars',SITE_URL:'https://mooncci.site',CSRF_TRUSTED_ORIGINS:'https://mooncci.site'});
 const setup=await require('mysql2/promise').createConnection({host:'127.0.0.1',port:Number(process.env.DB_PORT),user:'root',multipleStatements:true});
 await setup.query(`CREATE DATABASE ${name} CHARACTER SET utf8mb4`);await setup.query(`USE ${name}`);await setup.query(fs.readFileSync(path.join(__dirname,'../database/schema.sql'),'utf8'));await setup.query(fs.readFileSync(path.join(__dirname,'../database/migrations/202609090002_auth_revocation.sql'),'utf8'));
 const db=require('../src/db'),jwt=require('jsonwebtoken');const [owner]=await db.query('INSERT INTO users(username,email,password_hash,role) VALUES ("writer","writer@example.test","unused","editor")');const [other]=await db.query('INSERT INTO users(username,email,password_hash,role) VALUES ("other","other@example.test","unused","editor")');
 await db.query('DROP TABLE article_drafts');await db.query('ALTER TABLE posts DROP COLUMN version');
 await db.query('INSERT INTO posts(title,slug,content,status,author_id) VALUES ("Existing","existing","Keep original content","published",?)',[owner.insertId]);
 await setup.query(fs.readFileSync(path.join(__dirname,'../database/migrations/202609110001_article_drafts.sql'),'utf8'));
 const [[legacy]]=await db.query('SELECT content,version FROM posts WHERE slug="existing"');assert.equal(legacy.content,'Keep original content');assert.equal(legacy.version,1);
 const token=id=>`mooncci_token=${jwt.sign({id,sessionStartedAt:Date.now()},process.env.JWT_SECRET)}`;const cookie=token(owner.insertId);
 const server=require('../src/index').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{await new Promise(r=>server.close(r));await db.end();await require('../src/platformDb').end();await setup.query(`DROP DATABASE ${name}`);await setup.end();});
 const req=(url,method='GET',body,auth=cookie)=>fetch(`http://127.0.0.1:${server.address().port}/api${url}`,{method,headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest',Origin:'https://mooncci.site',Cookie:auth},...(body?{body:JSON.stringify(body)}:{})});

 const id=crypto.randomUUID();const [[post]]=await db.query('SELECT * FROM posts WHERE slug="existing"');
 const request=async(url,method,body,auth)=>{const r=await req(url,method,body,auth);const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;};
 let d=await request('/article-drafts','POST',{id,post_id:post.id});
 let list=await request(`/article-drafts/${id}/revisions`);assert.equal(list.items[0].kind,'baseline');const baselineId=list.items[0].id;
 await db.query("UPDATE posts SET published_at='2024-11-13 10:00:00' WHERE id=?",[post.id]);
 const initial=await request(`/posts/${post.id}`);
 d=await request(`/article-drafts/${id}`,'PUT',{version:d.version,save_kind:'auto',payload:{...d.payload,content:'first auto'}});
 d=await request(`/article-drafts/${id}`,'PUT',{version:d.version,save_kind:'auto',payload:{...d.payload,content:'last auto'}});
 list=await request(`/article-drafts/${id}/revisions`);assert.equal(list.items.filter(x=>x.kind==='auto').length,1);
 const autoDetail=await request(`/article-drafts/${id}/revisions/${list.items.find(x=>x.kind==='auto').id}`);assert.equal(autoDetail.payload.content,'last auto');
 d=await request(`/article-drafts/${id}`,'PUT',{version:d.version,save_kind:'manual',payload:d.payload});
 d=await request(`/article-drafts/${id}`,'PUT',{version:d.version,save_kind:'manual',payload:d.payload});
 list=await request(`/article-drafts/${id}/revisions`);assert.equal(list.items.filter(x=>x.kind==='manual').length,1);
 assert.equal((await req(`/article-drafts/${id}/revisions`,'GET',null,token(other.insertId))).status,404);
 assert.equal((await req(`/article-drafts/${id}/revisions/${baselineId}`,'GET',null,'')).status,401);
 // Recovery only changes the draft, and a retry with the old version cannot overwrite it.
 const before=d.version;
 d=await request(`/article-drafts/${id}/revisions/${baselineId}/restore`,'POST',{version:before});
 assert.equal(d.payload.content,'Keep original content');
 const unchanged=await request(`/posts/${post.id}`);assert.equal(unchanged.updated_at,initial.updated_at);assert.equal(unchanged.version,initial.version);
 assert.equal((await req(`/article-drafts/${id}/revisions/${baselineId}/restore`,'POST',{version:before})).status,409);
 list=await request(`/article-drafts/${id}/revisions`);assert(list.items.some(x=>x.kind==='restore'));
 // Publishing restored content preserves its original publication date and archives one version.
 d=await request(`/article-drafts/${id}/publish`,'POST',{version:d.version});
 const published=await request(`/posts/${post.id}`);assert.equal(published.published_at,initial.published_at);assert(published.version>initial.version);
 const replay=await request(`/article-drafts/${id}/publish`,'POST',{version:d.version});assert.equal(replay.replayed,true);
 list=await request(`/article-drafts/${id}/revisions`);assert.equal(list.items.filter(x=>x.kind==='publish').length,1);
 // Failed history insertion rolls back draft writes.
 await db.query("CREATE TRIGGER qa_revision_fail BEFORE INSERT ON article_revisions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='qa rollback'");
 const failed=await req(`/article-drafts/${id}`,'PUT',{version:d.version,save_kind:'manual',payload:{...d.payload,title:'must rollback'}});assert.equal(failed.status,500);
 await db.query('DROP TRIGGER qa_revision_fail');assert.equal((await request(`/article-drafts/${id}`)).version,d.version);
 // Retention touches only automatic history, not manual records/current draft.
 const values=Array.from({length:205},(_,n)=>[post.id,id,owner.insertId,'auto','{}','x'.repeat(64),n]);
 await db.query('INSERT INTO article_revisions(post_id,draft_id,actor_id,kind,payload,content_hash,auto_bucket) VALUES ?',[values]);
 await db.query("UPDATE article_revisions SET updated_at=DATE_SUB(NOW(),INTERVAL 31 DAY) WHERE post_id=? AND kind='auto' ORDER BY id LIMIT 1",[post.id]);
 await require('../src/lib/articleRevisions').cleanup(db);
 const [[count]]=await db.query("SELECT COUNT(*) n FROM article_revisions WHERE post_id=? AND kind='auto'",[post.id]);assert.equal(Number(count.n),200);
 const [[manual]]=await db.query("SELECT COUNT(*) n FROM article_revisions WHERE post_id=? AND kind='manual'",[post.id]);assert.equal(Number(manual.n),1);
 assert.equal((await request(`/article-drafts/${id}`)).version,d.version);
 // Concurrent restore: exactly one mutation wins.
 const outcomes=await Promise.all([req(`/article-drafts/${id}/revisions/${baselineId}/restore`,'POST',{version:d.version}),req(`/article-drafts/${id}/revisions/${baselineId}/restore`,'POST',{version:d.version})]);assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,409]);
 d=await request(`/article-drafts/${id}`);
 await request(`/article-drafts/${id}`,'DELETE',{version:d.version});
 const [[kept]]=await db.query('SELECT COUNT(*) n FROM article_revisions WHERE post_id=?',[post.id]);assert(Number(kept.n)>0);
 const fresh=crypto.randomUUID();let nd=await request('/article-drafts','POST',{id:fresh,payload:{title:'new',content:'new body'}});
 nd=await request(`/article-drafts/${fresh}`,'PUT',{version:nd.version,save_kind:'manual',payload:nd.payload});
 await request(`/article-drafts/${fresh}`,'DELETE',{version:nd.version});const [[gone]]=await db.query('SELECT COUNT(*) n FROM article_revisions WHERE draft_id=?',[fresh]);assert.equal(Number(gone.n),0);
 await request(`/posts/${post.id}`,'DELETE');const [[removed]]=await db.query('SELECT COUNT(*) n FROM article_revisions WHERE post_id=?',[post.id]);assert.equal(Number(removed.n),0);
});

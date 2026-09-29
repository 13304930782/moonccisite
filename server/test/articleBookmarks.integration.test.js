const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
test('private bookmarks: pagination, idempotency, withdrawal, permissions and deletion',{skip:process.env.BOOKMARK_INTEGRATION!=='true'},async t=>{
 const name=`mooncci_qa_bookmarks_${process.pid}`;
 Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:process.env.TEST_DB_PORT||'33079',DB_USER:'root',DB_PASSWORD:'',DB_NAME:name,JWT_SECRET:'bookmark-test-secret-only-more-than-32-chars',SITE_URL:'https://mooncci.site',CSRF_TRUSTED_ORIGINS:'https://mooncci.site'});
 const setup=await require('mysql2/promise').createConnection({host:'127.0.0.1',port:Number(process.env.DB_PORT),user:'root',multipleStatements:true});
 await setup.query(`CREATE DATABASE ${name} CHARACTER SET utf8mb4`);await setup.query(`USE ${name}`);await setup.query(fs.readFileSync(path.join(__dirname,'../database/schema.sql'),'utf8'));await setup.query(fs.readFileSync(path.join(__dirname,'../database/migrations/202609090002_auth_revocation.sql'),'utf8'));
 const db=require('../src/db'),jwt=require('jsonwebtoken');
 const [owner]=await db.query('INSERT INTO users(username,email,password_hash,role) VALUES ("owner","owner@example.test","unused","owner")');
 const [reader]=await db.query('INSERT INTO users(username,email,password_hash,role) VALUES ("reader","reader@example.test","unused","user")');
 const [other]=await db.query('INSERT INTO users(username,email,password_hash,role) VALUES ("other","other@example.test","unused","user")');
 const token=id=>`mooncci_token=${jwt.sign({id,sessionStartedAt:Date.now()},process.env.JWT_SECRET)}`;const cookie=token(reader.insertId);
 const server=require('../src/index').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(async()=>{await new Promise(r=>server.close(r));await db.end();await require('../src/platformDb').end();await setup.query(`DROP DATABASE ${name}`);await setup.end();});
 const req=(url,method='GET',body,auth=cookie,origin='https://mooncci.site')=>fetch(`http://127.0.0.1:${server.address().port}/api${url}`,{method,headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest',Origin:origin,Cookie:auth},...(body?{body:JSON.stringify(body)}:{})});
 const ok=async(url,method,body,auth)=>{const r=await req(url,method,body,auth),d=await r.json();assert.equal(r.status,200,JSON.stringify(d));assert.match(r.headers.get('cache-control'),/no-store/);return d;};
 const ids=[];for(let i=0;i<13;i++){const [p]=await db.query('INSERT INTO posts(title,slug,summary,content,cover_image,status,author_id) VALUES (?,?,?,?,?,"published",?)',[`Title ${i}`,`post-${i}`,`Secret summary ${i}`,'Full content','https://example.test/private.png',owner.insertId]);ids.push(p.insertId);await ok(`/bookmarks/${p.insertId}`,'PUT');}
 const before=await ok(`/bookmarks/${ids[0]}`);assert.equal(before.bookmarked,true);
 await Promise.all([ok(`/bookmarks/${ids[0]}`,'PUT'),ok(`/bookmarks/${ids[0]}`,'PUT')]);
 await db.query('UPDATE article_bookmarks SET created_at="2026-01-01 00:00:00"');
 let page=await ok('/bookmarks?page=1');assert.equal(page.total,13);assert.equal(page.items.length,12);assert.equal(page.items[0].post_id,ids[12]);
 page=await ok('/bookmarks?page=2');assert.equal(page.items.length,1);assert.equal(page.items[0].post_id,ids[0]);
 assert.equal((await ok(`/bookmarks?user_id=${reader.insertId}`,'GET',null,token(other.insertId))).total,0);
 assert.equal((await req('/bookmarks','GET',null,'')).status,401);
 assert.equal((await req(`/bookmarks/${ids[1]}`,'PUT',null,cookie,'https://evil.test')).status,403);
 await db.query('UPDATE posts SET status="draft" WHERE id=?',[ids[12]]);
 page=await ok('/bookmarks');const hidden=page.items[0];assert.deepEqual(Object.keys(hidden).sort(),['available','created_at','id','post_id']);assert.equal(hidden.available,false);
 assert.equal((await req(`/bookmarks/${ids[12]}`,'PUT')).status,404);
 await db.query('UPDATE posts SET status="published" WHERE id=?',[ids[12]]);assert.equal((await ok('/bookmarks')).items[0].title,'Title 12');
 await ok(`/bookmarks/${ids[0]}`,'DELETE');await ok(`/bookmarks/${ids[0]}`,'DELETE');page=await ok('/bookmarks?page=2');assert.equal(page.page,1);assert.equal(page.total,12);
 await db.query('UPDATE posts SET status="draft" WHERE id=?',[ids[12]]);await ok(`/bookmarks/${ids[12]}`,'DELETE');assert.equal((await ok('/bookmarks')).total,11);
 await db.query('DELETE FROM posts WHERE id=?',[ids[1]]);assert.equal((await ok('/bookmarks')).total,10);
 // Account soft deletion clears personal relations in the same transaction.
 const deleted=await req(`/admin/users/${reader.insertId}/account`,'DELETE',{username:'reader'},token(owner.insertId));assert.equal(deleted.status,200,await deleted.text());
 const [[remaining]]=await db.query('SELECT COUNT(*) n FROM article_bookmarks WHERE user_id=?',[reader.insertId]);assert.equal(Number(remaining.n),0);
 assert.equal((await req('/bookmarks')).status,401);
 await ok(`/bookmarks/${ids[3]}`,'PUT',null,token(other.insertId));await db.query('DELETE FROM users WHERE id=?',[other.insertId]);
 const [[all]]=await db.query('SELECT COUNT(*) n FROM article_bookmarks');assert.equal(Number(all.n),0);
});

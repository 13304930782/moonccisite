const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
test('article likes keep one row per reader and post under concurrent requests',{skip:process.env.BOOKMARK_INTEGRATION!=='true'},async t=>{
 const name=`mooncci_qa_likes_${process.pid}`;
 Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:process.env.TEST_DB_PORT||'33079',DB_USER:'root',DB_PASSWORD:'',DB_NAME:name,JWT_SECRET:'article-like-test-secret-more-than-32-chars',SITE_URL:'https://mooncci.site',CSRF_TRUSTED_ORIGINS:'https://mooncci.site'});
 const setup=await require('mysql2/promise').createConnection({host:'127.0.0.1',port:Number(process.env.DB_PORT),user:'root',multipleStatements:true});
 await setup.query(`CREATE DATABASE ${name} CHARACTER SET utf8mb4`);await setup.query(`USE ${name}`);await setup.query(fs.readFileSync(path.join(__dirname,'../database/schema.sql'),'utf8'));await setup.query(fs.readFileSync(path.join(__dirname,'../database/migrations/202609090002_auth_revocation.sql'),'utf8'));
 const db=require('../src/db'),jwt=require('jsonwebtoken');
 const [reader]=await db.query('INSERT INTO users(username,email,password_hash,role) VALUES ("reader","reader@example.test","unused","user")');
 const [post]=await db.query('INSERT INTO posts(title,slug,summary,content,cover_image,status,author_id) VALUES ("Title","title","","Content","","published",?)',[reader.insertId]);
 const cookie=`mooncci_token=${jwt.sign({id:reader.insertId,sessionStartedAt:Date.now()},process.env.JWT_SECRET)}`;
 const server=require('../src/index').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(async()=>{await new Promise(r=>server.close(r));await db.end();await require('../src/platformDb').end();await setup.query(`DROP DATABASE ${name}`);await setup.end()});
 const request=(method='GET',auth=cookie)=>fetch(`http://127.0.0.1:${server.address().port}/api/article-likes/${post.insertId}`,{method,headers:{'X-Requested-With':'XMLHttpRequest',Origin:'https://mooncci.site',Cookie:auth}});
 assert.equal((await request('PUT','')).status,401);
 const responses=await Promise.all(Array.from({length:5},()=>request('PUT')));for(const response of responses)assert.equal(response.status,200);
 let [[count]]=await db.query('SELECT COUNT(*) n FROM article_likes WHERE post_id=?',[post.insertId]);assert.equal(count.n,1);
 assert.deepEqual(await (await request()).json(),{like_count:1,liked:true});assert.deepEqual(await (await request('GET','')).json(),{like_count:1,liked:false});
 assert.deepEqual(await (await request('DELETE')).json(),{like_count:0,liked:false});assert.deepEqual(await (await request('DELETE')).json(),{like_count:0,liked:false});
});

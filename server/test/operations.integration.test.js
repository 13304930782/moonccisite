const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),crypto=require('crypto');
test('phase 3 real MySQL: session ownership, legacy compatibility, revocation, throttle and operations accuracy',{skip:process.env.OPERATIONS_INTEGRATION!=='true'},async t=>{
 const mysql=require('mysql2/promise'),name='mooncci_qa_operations_'+process.pid;
 Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:process.env.TEST_DB_PORT||'33079',DB_USER:'root',DB_PASSWORD:'',DB_NAME:name,JWT_SECRET:'phase-three-local-only',ACCOUNT_OPERATIONS_ENABLED:'true',COOKIE_SECURE:'false',MAIL_ENABLED:'false'});
 const c=await mysql.createConnection({host:'127.0.0.1',port:Number(process.env.TEST_DB_PORT||33079),user:'root',multipleStatements:true});let server,db;
 try{
 await c.query('CREATE DATABASE '+name+' CHARACTER SET utf8mb4');await c.query('USE '+name);
 await c.query(fs.readFileSync(require('path').resolve(__dirname,'../database/schema.sql'),'utf8'));
 await c.query(fs.readFileSync(require('path').resolve(__dirname,'../database/migrations/202609090002_auth_revocation.sql'),'utf8'));
 const migration=fs.readFileSync(require('path').resolve(__dirname,'../database/migrations/202609220002_account_operations.sql'),'utf8');await c.query(migration);await c.query(migration);
 const path=require('path'),fixtures=path.resolve(__dirname,'../../.cache');fs.mkdirSync(fixtures,{recursive:true});
 const live=fs.mkdtempSync(path.join(fixtures,'operations-migration-'));
 t.after(()=>{assert.ok(live.startsWith(fixtures+path.sep+'operations-migration-'));fs.rmSync(live,{recursive:true,force:true});});
 fs.writeFileSync(path.join(live,'.env'),'# isolated test only\n');
 for(const [file,target] of [['dotenv/index.js','dotenv'],['mysql2/promise.js','mysql2/promise']]){const dest=path.join(live,'node_modules',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,'module.exports=require('+JSON.stringify(require.resolve(target))+');');}
 await c.query("CREATE TABLE schema_migrations(filename VARCHAR(255) PRIMARY KEY,checksum CHAR(64) NOT NULL)");await c.query("INSERT INTO schema_migrations VALUES ('historical.sql',?)",['a'.repeat(64)]);
 for(let i=0;i<2;i++){const result=require('child_process').spawnSync(process.execPath,[path.join(__dirname,'../scripts/migrate-operations.js'),live],{env:process.env,encoding:'utf8'});assert.equal(result.status,0,result.stderr);}
 assert.equal((await c.query("SELECT checksum FROM schema_migrations WHERE filename='historical.sql'"))[0][0].checksum,'a'.repeat(64));
 const [a]=await c.query("INSERT INTO users(username,email,password_hash,role) VALUES ('reader','reader@example.test','unused','user')");
 const [b]=await c.query("INSERT INTO users(username,email,password_hash,role) VALUES ('other','other@example.test','unused','user')");
 const [admin]=await c.query("INSERT INTO users(username,email,password_hash,role) VALUES ('admin','admin@example.test','unused','admin')");
 const jwt=require('jsonwebtoken'),token=(id,extra={})=>jwt.sign({id,jti:crypto.randomUUID(),...extra},process.env.JWT_SECRET,{expiresIn:'7d'}),a1=token(a.insertId),a2=token(a.insertId,{sv:1}),unseen=token(a.insertId),b1=token(b.insertId),ad=token(admin.insertId);
 const app=require('express')();app.use(require('express').json());app.use('/api/account',require('../src/routes/loginSessions'));app.use('/api/auth',require('../src/routes/auth-cookie'));app.use('/api/admin/operations',require('../src/routes/operations'));app.use((e,req,res,next)=>{console.error(e);res.status(500).json({message:'test failure'});});
 db=require('../src/db');server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const call=(url,t=a1,method='GET',body)=>fetch('http://127.0.0.1:'+server.address().port+'/api'+url,{method,headers:{Cookie:'mooncci_token='+t,'Content-Type':'application/json','User-Agent':'Mozilla/5.0 Windows Chrome/128.0'},body:body?JSON.stringify(body):undefined});
 let response=await call('/account/sessions');assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
 let list=await response.json();assert.equal(list.items.length,1);assert.equal(list.items[0].legacy,1);assert.equal(list.items[0].current,true);assert.equal(list.items[0].browser,'Chrome');assert.equal(list.items[0].token_hash,undefined);
 const id=list.items[0].id,seen=list.items[0].last_seen;
 await call('/account/sessions');const [[row]]=await c.query('SELECT last_seen FROM login_sessions WHERE id=?',[id]);assert.equal(row.last_seen,seen);
 assert.equal((await call('/account/sessions/'+id,b1,'DELETE')).status,404);
 const second=await(await call('/account/sessions',a2)).json(),secondId=second.items.find(s=>s.current).id;
 assert.equal((await call('/account/sessions/'+secondId,a1,'DELETE')).status,200);
 assert.equal((await call('/auth/me',a2)).status,401);assert.equal((await call('/auth/me',a1)).status,200);assert.equal((await call('/auth/me',b1)).status,200);
 const rotated=await call('/account/sessions/revoke-others',a1,'POST',{});assert.equal(rotated.status,200);const fresh=decodeURIComponent(rotated.headers.get('set-cookie').split(';')[0].split('=').slice(1).join('='));
 assert.equal(jwt.decode(fresh).exp,jwt.decode(a1).exp);
 assert.equal((await call('/auth/me',unseen)).status,401);assert.equal((await call('/auth/me',a1)).status,401);assert.equal((await call('/auth/me',fresh)).status,200);assert.equal((await call('/auth/me',b1)).status,200);
 const active=(await(await call('/account/sessions',fresh)).json()).items;assert.equal(active.length,1);
 assert.equal((await(await call('/account/sessions/'+active[0].id,fresh,'DELETE')).json()).current,true);assert.equal((await call('/auth/me',fresh)).status,401);
 await c.query("UPDATE users SET status='disabled' WHERE id=?",[b.insertId]);assert.equal((await call('/auth/me',b1)).status,403);await c.query("UPDATE users SET status='active' WHERE id=?",[b.insertId]);
 const reset=crypto.randomBytes(32).toString('hex');await c.query('INSERT INTO password_resets(user_id,token_hash,expires_at) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 30 MINUTE))',[b.insertId,crypto.createHash('sha256').update(reset).digest('hex')]);
 assert.equal((await call('/auth/reset-password',b1,'POST',{token:reset,password:'NewPassword2026!'})).status,200);assert.equal((await call('/auth/me',b1)).status,401);
 const [post]=await c.query("INSERT INTO posts(title,slug,content,tags,status,author_id,published_at) VALUES ('Operations article','ops-test','body','[]','published',?,NOW())",[admin.insertId]);
 await c.query("INSERT INTO comments(post_id,user_id,content,status) VALUES (?,?,'visible','visible'),(?,?,'pending','pending'),(?,?,'hidden','hidden')",[post.insertId,a.insertId,post.insertId,a.insertId,post.insertId,a.insertId]);
 await c.query('INSERT INTO article_bookmarks(user_id,post_id) VALUES (?,?)',[a.insertId,post.insertId]);
 await c.query("INSERT INTO analytics_daily(day,page_hash,path,views) VALUES (UTC_DATE(),?, ?,9)",[crypto.createHash('sha256').update('/article/'+post.insertId).digest('hex'),'/article/'+post.insertId]);
 assert.equal((await call('/admin/operations',token(a.insertId,{sessionStartedAt:Date.now()+1}))).status,403);
 const report=await(await call('/admin/operations?days=7',ad)).json();assert.equal(report.summary.comments,1);assert.equal(report.summary.bookmarks,1);assert.equal(report.summary.views,9);assert.equal(report.articles[0].comments,1);assert.equal(report.trend.length,7);assert.equal(report.trend[0].views,null);
 assert.equal((await call('/admin/operations?from=2026-02-30&to=2026-03-01',ad)).status,400);assert.equal((await call('/admin/operations?days=91',ad)).status,400);
 process.env.ACCOUNT_OPERATIONS_ENABLED='false';assert.equal((await call('/account/sessions',ad)).status,404);assert.equal((await call('/auth/me',ad)).status,200);assert.equal((await call('/auth/me',a1)).status,401,'global revocation persists with flag off');
 console.log('PASS: additive migration x2, legacy/new/unknown sessions, IDOR, immediate revocation, reset/disable, activity throttle, cookie rotation expiry, feature-off safety, admin-only metrics and missing historical data');
 }finally{if(server)await new Promise(r=>server.close(r));if(db)await db.end();await c.query('DROP DATABASE IF EXISTS '+name);await c.end();}
});
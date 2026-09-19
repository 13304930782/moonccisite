const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('runtime status requires admin and reads actual migration records',{skip:process.env.RUNTIME_INTEGRATION!=='true'},async t=>{
 const name=`mooncci_qa_runtime_${process.pid}`;
 Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:process.env.TEST_DB_PORT||'33079',DB_USER:'root',DB_PASSWORD:'',DB_NAME:name,JWT_SECRET:'runtime-test-secret-only-more-than-32-chars'});
 const setup=await require('mysql2/promise').createConnection({host:'127.0.0.1',port:Number(process.env.DB_PORT),user:'root',multipleStatements:true});
 await setup.query(`CREATE DATABASE ${name} CHARACTER SET utf8mb4; USE ${name}`);
 await setup.query(fs.readFileSync(path.join(__dirname,'../database/schema.sql'),'utf8'));
 await setup.query(fs.readFileSync(path.join(__dirname,'../database/migrations/202609090002_auth_revocation.sql'),'utf8'));
 await setup.query('CREATE TABLE schema_migrations(filename VARCHAR(255) PRIMARY KEY,executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
 await setup.query('INSERT INTO schema_migrations(filename) VALUES ("runtime-test.sql")');
 const db=require('../src/db'),jwt=require('jsonwebtoken');
 const express=require('express'),app=express();app.use('/api/admin',require('../src/routes/admin'));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(async()=>{await new Promise(r=>server.close(r));await db.end();await setup.query(`DROP DATABASE ${name}`);await setup.end();});
 const url=`http://127.0.0.1:${server.address().port}/api/admin/runtime`;
 assert.equal((await fetch(url)).status,401);
 for(const role of ['user','editor','admin','owner']){
  const [u]=await db.query('INSERT INTO users(username,email,password_hash,role) VALUES (?,?,"unused",?)',[role,role+'@example.test',role]);
  const token=jwt.sign({id:u.insertId,sessionStartedAt:Date.now()},process.env.JWT_SECRET);
  const r=await fetch(url,{headers:{Authorization:'Bearer '+token}});
  assert.equal(r.status,['owner','admin'].includes(role)?200:403);
  assert.match(r.headers.get('cache-control'),/no-store/);
  if(r.status===200){const data=await r.json();assert.equal(data.migrations[0].filename,'runtime-test.sql');assert(!JSON.stringify(data).includes('runtime-test-secret'));}
 }
});

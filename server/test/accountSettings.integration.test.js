const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');
test('account profile, email proof, social replacement and retained deleted authors', {skip:process.env.ACCOUNT_INTEGRATION!=='true'}, async t=>{
  const database=`mooncci_qa_account_${process.pid}`;
  Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:process.env.TEST_DB_PORT||'33079',DB_USER:'root',DB_PASSWORD:'',DB_NAME:database,JWT_SECRET:'account-settings-test-secret-only-32-chars',SITE_URL:'https://mooncci.site',COOKIE_SECURE:'true',CSRF_TRUSTED_ORIGINS:'https://mooncci.site'});
  const mysql=require('mysql2/promise');
  const setup=await mysql.createConnection({host:'127.0.0.1',port:Number(process.env.DB_PORT),user:'root',password:'',multipleStatements:true});
  await setup.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4`);await setup.query(`USE ${database}`);
  await setup.query(fs.readFileSync(path.join(__dirname,'../database/schema.sql'),'utf8'));
  await setup.query(fs.readFileSync(path.join(__dirname,'../database/migrations/202609090002_auth_revocation.sql'),'utf8'));
  const mailer=require('../src/lib/mailer'),adapters=require('../src/lib/socialProviders'),google=require('../src/lib/googleIdentity');
  const mails=[];let mailFails=false;let identity;
  t.mock.method(mailer,'sendMail',async data=>{if(mailFails)return {sent:false};mails.push(data);return {sent:true};});
  t.mock.method(adapters,'exchange',async()=>identity);
  t.mock.method(google,'verifyGoogleCredential',async()=>identity);
  const db=require('../src/db'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken');
  const password=await bcrypt.hash('Current-password-123',10);
  const add=async(name,role='user')=>{const [r]=await db.query('INSERT INTO users(username,email,password_hash,role) VALUES (?,?,?,?)',[name,`${name}@example.test`,password,role]);return r.insertId;};
  const ownerId=await add('owner','owner'),adminId=await add('admin','admin'),id=await add('reader'),other=await add('other');
  const token=id=>`mooncci_token=${jwt.sign({id,sessionStartedAt:Date.now(),jti:Math.random().toString()},process.env.JWT_SECRET,{expiresIn:'1h'})}`;
  const owner=token(ownerId),admin=token(adminId);let user=token(id);const stale=user;
  const app=require('../src/index'),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(async()=>{await new Promise(r=>server.close(r));await db.end();await require('../src/platformDb').end();await setup.query(`DROP DATABASE ${database}`);await setup.end();});
  let seq=0;
  const req=(url,method='GET',body,cookie=user)=>fetch(`http://127.0.0.1:${server.address().port}/api${url}`,{method,redirect:'manual',headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest',Origin:'https://mooncci.site','X-Forwarded-For':`192.0.2.${++seq%250+1}`,Cookie:cookie},...(body?{body:JSON.stringify(body)}:{})});
  const freshCookie=r=>r.headers.getSetCookie().find(c=>c.startsWith('mooncci_token='))?.split(';')[0];
  assert.equal((await req('/account','GET',null,'')).status,401);
  assert.equal((await req(`/admin/users/${id}/settings`)).status,403);
  assert.equal((await req(`/admin/users/${ownerId}/settings`,'GET',null,admin)).status,403);
  let r=await req('/account','PUT',{username:'Reader changed',version:0});assert.equal(r.status,200);let profile=(await r.json()).user;assert.equal(profile.username,'Reader changed');
  assert.equal((await req('/account','PUT',{username:'Stale',version:0})).status,409);
  // A new email alone is insufficient; password and one-use code are both required.
  r=await req('/account/email-code','POST',{email:'fresh@example.test'});assert.equal(r.status,200);let challenge=(await r.json()).challenge_id;
  let code=mails.at(-1).text.match(/\b\d{6}\b/)[0];
  assert.equal((await req('/account/email','POST',{challenge_id:challenge,new_code:code,password:'wrong'})).status,400);
  assert.equal((await req('/account/email','POST',{challenge_id:challenge,new_code:'000000',password:'Current-password-123'})).status,400);
  r=await req('/account/email','POST',{challenge_id:challenge,new_code:code,password:'Current-password-123'});assert.equal(r.status,200);user=freshCookie(r);assert.ok(user);assert.equal((await r.json()).user.email,'fresh@example.test');
  assert.equal((await req('/account','GET',null,stale)).status,401);
  assert.equal((await req('/account/email','POST',{challenge_id:challenge,new_code:code,password:'Current-password-123'})).status,400);
  await req('/account/password-reset','POST');assert.match(mails.at(-1).text,/reset-password\?token=/);assert.equal(mails.at(-1).to,'fresh@example.test');
  // Profile image processing is bounded and stores a re-encoded local asset.
  const image=await require('sharp')({create:{width:4,height:4,channels:3,background:'#123456'}}).png().toBuffer();
  const form=new FormData();form.append('avatar',new Blob([image],{type:'image/png'}),'avatar.png');
  r=await fetch(`http://127.0.0.1:${server.address().port}/api/account/avatar`,{method:'POST',headers:{'X-Requested-With':'XMLHttpRequest',Origin:'https://mooncci.site',Cookie:user},body:form});assert.equal(r.status,200);const avatar=(await r.json()).user.avatar_url;assert.match(avatar,/^\/api\/uploads\/avatars\/[a-f0-9-]+\.webp$/);
  t.after(()=>fs.promises.unlink(path.join(__dirname,'../uploads/avatars',path.basename(avatar))));
  // Replacing a third-party identity is atomic: failed ownership check preserves the old one.
  const config=require('../src/lib/socialConfig');
  await db.query('INSERT INTO oauth_providers(provider,enabled,client_id,secret_cipher) VALUES ("github",1,"fixture",?)',[config.encrypt('secret','github')]);
  await db.query('INSERT INTO oauth_identities(provider,client_id,subject,user_id) VALUES ("github","fixture","old",?),("github","fixture","taken",?)',[id,other]);
  async function proof(){await db.query('UPDATE account_challenges SET created_at=0 WHERE user_id=?',[id]);const r=await req('/account/security-code','POST');assert.equal(r.status,200);return {challenge_id:(await r.json()).challenge_id,old_code:mails.at(-1).text.match(/\b\d{6}\b/)[0]};}
  async function flow(body){const r=await req('/auth/github/start','POST',body);assert.equal(r.status,200);const url=new URL((await r.json()).url);return {state:url.searchParams.get('state'),cookie:`${user}; ${r.headers.getSetCookie()[0].split(';')[0]}`};}
  let g=await flow({mode:'replace',...await proof()});identity={subject:'taken',name:'Taken',emailVerified:false};
  r=await req(`/auth/github/callback?state=${g.state}&code=fixture`,'GET',null,g.cookie);assert.match(r.headers.get('location'),/failed/);
  assert.equal((await db.query('SELECT subject FROM oauth_identities WHERE user_id=?',[id]))[0][0].subject,'old');
  g=await flow({mode:'replace',...await proof()});identity={subject:'new',name:'New',emailVerified:false};r=await req(`/auth/github/callback?state=${g.state}&code=fixture`,'GET',null,g.cookie);assert.match(r.headers.get('location'),/oauth=bound/);assert.equal((await db.query('SELECT subject FROM oauth_identities WHERE user_id=?',[id]))[0][0].subject,'new');
  // Email reauthentication must return the identity already bound to this user.
  await db.query('UPDATE account_challenges SET created_at=0 WHERE user_id=?',[id]);
  r=await req('/account/email-code','POST',{email:'social-confirmed@example.test'});challenge=(await r.json()).challenge_id;code=mails.at(-1).text.match(/\b\d{6}\b/)[0];
  g=await flow({mode:'email',challenge_id:challenge,new_code:code});identity={subject:'new',name:'New',emailVerified:false};
  r=await req(`/auth/github/callback?state=${g.state}&code=fixture`,'GET',null,g.cookie);assert.equal(r.headers.get('location'),'/account/settings?email=updated');user=freshCookie(r);assert.equal((await (await req('/account')).json()).user.email,'social-confirmed@example.test');
  // Deletion keeps authorship and display identity, releases login identities and revokes sessions.
  const [post]=await db.query('INSERT INTO posts(title,slug,content,author_id) VALUES ("Retained","retained","body",?)',[id]);
  await db.query('INSERT INTO comments(post_id,user_id,content) VALUES (?, ?, "retained comment")',[post.insertId,id]);
  assert.equal((await req(`/admin/users/${id}/account`,'DELETE',{username:'wrong'},owner)).status,400);
  assert.equal((await req(`/admin/users/${ownerId}/account`,'DELETE',{username:'owner'},owner)).status,400);
  r=await req(`/admin/users/${id}/account`,'DELETE',{username:'Reader changed'},owner);assert.equal(r.status,200);
  assert.equal((await req('/account')).status,401);
  const [[kept]]=await db.query('SELECT u.username,u.email,p.avatar_url,p.deleted_at FROM users u JOIN account_profiles p ON p.user_id=u.id WHERE u.id=?',[id]);assert.equal(kept.username,'Reader changed');assert.equal(kept.avatar_url,avatar);assert.ok(kept.deleted_at);assert.match(kept.email,/@account.invalid$/);
  assert.equal((await db.query('SELECT id FROM posts WHERE author_id=?',[id]))[0].length,1);assert.equal((await db.query('SELECT id FROM comments WHERE user_id=?',[id]))[0].length,1);assert.equal((await db.query('SELECT subject FROM oauth_identities WHERE user_id=?',[id]))[0].length,0);
  assert.equal((await req(`/admin/users/${id}`,'PUT',{status:'active'},owner)).status,400);
  assert.equal((await (await req(`/admin/users/${id}/settings`,'GET',null,owner)).json()).user.email,'');
  mailFails=true;assert.equal((await req(`/admin/users/${other}/password-reset`,'POST',{},owner)).status,503);
});

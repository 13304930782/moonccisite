const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const channels=require('../src/lib/mailChannels');
test('profiles preserve legacy credentials, redact every secret and reject invalid identities',()=>{
 const old={smtp_user:'legacy@example.test',smtp_pass:'legacy-secret',smtp_from:'legacy@example.test'};
 assert.equal(channels.resolveConfig(old,'electricity').smtp_user,old.smtp_user);
 const patch={electricity:{mode:'custom',password:'electricity-secret'}};const saved={...old,channels:channels.mergeProfiles(patch,old)};
 assert.equal(channels.resolveConfig(saved,'electricity').smtp_pass,'electricity-secret');assert.equal(channels.resolveConfig(saved,'support').smtp_pass,'legacy-secret');
 assert.ok(!JSON.stringify(channels.publicProfiles(saved)).includes('electricity-secret'));assert.equal(channels.publicProfiles(saved).electricity.has_password,true);
 assert.equal(channels.mergeProfiles({electricity:{password:''}},saved).electricity.password,'electricity-secret');
 assert.throws(()=>channels.mergeProfiles({electricity:{address:'new@example.test'}},saved),/密码/);
 assert.throws(()=>channels.mergeProfiles({abuse:{}},old),/业务/);assert.throws(()=>channels.mergeProfiles({support:{reply_to:'x@example.test\r\nBcc: y@example.test'}},old),/邮箱/);
 assert.throws(()=>channels.mergeProfiles({support:{mode:'custom'}},old),/密码/);
 const broken={...saved,channels:{electricity:{mode:'custom',address:'electricity@mooncci.site',password:''}}};assert.equal(channels.resolveConfig(broken,'electricity').smtp_pass,'');
});
test('real settings routes route six identities, preserve passwords and enforce permissions',{skip:process.env.MAIL_CHANNELS_INTEGRATION!=='true'},async t=>{
 const name='mooncci_qa_mailchannels_'+process.pid;Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:'33079',DB_USER:'root',DB_PASSWORD:'',DB_NAME:name,JWT_SECRET:'mail-channels-test-only-32-characters',SITE_URL:'https://mooncci.site',MAIL_ENABLED:'false',ACCOUNT_OPERATIONS_ENABLED:'false',ENGAGEMENT_ENABLED:'false'});
 const setup=await require('mysql2/promise').createConnection({host:'127.0.0.1',port:33079,user:'root',multipleStatements:true});await setup.query('CREATE DATABASE '+name+' CHARACTER SET utf8mb4');await setup.query('USE '+name);await setup.query(fs.readFileSync(path.join(__dirname,'../database/schema.sql'),'utf8'));await setup.query(fs.readFileSync(path.join(__dirname,'../database/migrations/202609090002_auth_revocation.sql'),'utf8'));
 const db=require('../src/db'),users={};for(const role of ['owner','user']){const [r]=await db.query('INSERT INTO users(username,email,password_hash,role) VALUES (?,?,?,?)',[role,role+'@example.test','unused',role]);users[role]=r.insertId;}
 const captures=[];let reject=false;t.mock.method(require('nodemailer'),'createTransport',config=>({sendMail:async mail=>{captures.push({config,mail});if(reject)throw Error('fixture rejected');return {accepted:[mail.to]};}}));
 const server=require('../src/index').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{await new Promise(r=>server.close(r));await db.end();await require('../src/platformDb').end();await setup.query('DROP DATABASE '+name);await setup.end();});
 const call=async(url,method='GET',body,role='owner')=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/settings'+url,{method,headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest',Origin:'https://mooncci.site',Cookie:role?'mooncci_token='+require('jsonwebtoken').sign({id:users[role],sessionStartedAt:Date.now()},process.env.JWT_SECRET):''},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
 let r=await call('/mail','PUT',{enabled:'true',smtp_host:'mail.example.test',smtp_port:'465',smtp_secure:'true',smtp_user:'legacy@example.test',smtp_from:'legacy@example.test',smtp_pass:'legacy-secret',notify_to:'owner@example.test'});assert.equal(r.status,200);assert.equal(r.data.mail.smtp_pass,'');assert.equal(Object.keys(r.data.mail.channels).length,6);
 assert.equal((await call('/mail','GET',null,'user')).status,403);assert.equal((await call('/mail','GET',null,null)).status,401);
 await call('/mail/test','POST',{});assert.equal(captures.at(-1).config.auth.pass,'legacy-secret');
 const custom=Object.fromEntries(Object.keys(channels.definitions).map(key=>[key,{mode:'custom',password:key+'-secret'}]));r=await call('/mail','PUT',{channels:custom});assert.equal(r.status,200);assert.ok(!JSON.stringify(r.data).includes('-secret'));
 for(const [key,d] of Object.entries(channels.definitions)){r=await call('/mail/test','POST',{channel:key});assert.equal(r.status,200);const got=captures.at(-1);assert.equal(got.config.auth.user,d.address);assert.equal(got.config.auth.pass,key+'-secret');assert.equal(got.mail.from.address,d.address);assert.equal(got.mail.from.name,d.name);assert.equal(got.mail.replyTo,d.reply_to);}
 r=await call('/mail','PUT',{channels:{news:{password:''}}});assert.equal(r.status,200);r=await call('/mail','PUT',{notify_to:'owner@example.test'});assert.equal(r.status,200);await call('/mail/test','POST',{channel:'news'});assert.equal(captures.at(-1).config.auth.pass,'news-secret');
 r=await call('/mail','PUT',{channels:{news:{address:'changed@example.test'}}});assert.equal(r.status,400);assert.match(r.data.message,/密码/);
 assert.equal((await call('/mail/test','POST',{channel:'abuse'})).status,400);
 await call('/mail/send-custom','POST',{to:'user@example.test',subject:'人工邮件',content:'测试正文'});assert.equal(captures.at(-1).mail.from.address,'support@mooncci.site');
 const mailer=require('../src/lib/mailer');await mailer.sendMail({to:'user@example.test',subject:'验证码',text:'test'});assert.equal(captures.at(-1).mail.from.address,'websiteaccount@mooncci.site');
 await mailer.sendCommentNotification({postTitle:'标题',content:'评论'});assert.equal(captures.at(-1).mail.from.address,'notifications@mooncci.site');
 await mailer.sendEarlyAccessOwnerNotification({id:1,name:'用户'});assert.equal(captures.at(-1).mail.from.address,'promptdock@mooncci.site');
 const count=captures.length;reject=true;await assert.rejects(mailer.sendMail({to:'user@example.test',subject:'test',text:'test',channel:'electricity'}));assert.equal(captures.length,count+1);assert.equal(captures.at(-1).config.auth.user,'electricity@mooncci.site');
 const backup=fs.mkdtempSync(path.resolve(__dirname,'../../.cache/mail-channel-rollback-'));
 await require('../../scripts/rollback-mail-channels-config.cjs').prepareRollback(db,backup);
 const [[stored]]=await db.query('SELECT setting_value FROM site_settings WHERE setting_key="mail"');const rolled=JSON.parse(stored.setting_value);assert.equal(rolled.channels,undefined);assert.equal(rolled.smtp_pass,'legacy-secret');
 const files=fs.readdirSync(backup);assert.equal(files.length,1);assert.equal(JSON.parse(fs.readFileSync(path.join(backup,files[0]),'utf8')).electricity.password,'electricity-secret');
});

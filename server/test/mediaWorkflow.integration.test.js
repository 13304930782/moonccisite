const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('real media rename and repeated compression keep file, dimensions and article references aligned', {skip:process.env.MEDIA_INTEGRATION!=='true'}, async t=>{
 const name='mooncci_qa_media_workflow_'+process.pid;
 Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:process.env.TEST_DB_PORT||'33079',DB_USER:'root',DB_PASSWORD:'',DB_NAME:name,JWT_SECRET:'isolated-media-workflow-test-secret',MAIL_ENABLED:'false',NEWSLETTER_DELIVERY_ENABLED:'false',PUBLISHING_ENABLED:'false'});
 const setup=await require('mysql2/promise').createConnection({host:'127.0.0.1',port:Number(process.env.DB_PORT),user:'root',multipleStatements:true});
 const parent=path.resolve(__dirname,'../../.cache');fs.mkdirSync(parent,{recursive:true});const fixture=fs.mkdtempSync(path.join(parent,'media-workflow-'));
 let db,server,created=false;const sharp=require('sharp');
 // Keep the normal Sharp cache enabled during all operations, including repeated paths.
 t.after(async()=>{if(server)await new Promise(r=>server.close(r));if(db)await db.end();if(created)await setup.query('DROP DATABASE '+name);await setup.end();sharp.cache(false);assert(fixture.startsWith(parent+path.sep));fs.rmSync(fixture,{recursive:true,force:true});});
 await setup.query('CREATE DATABASE '+name+' CHARACTER SET utf8mb4');created=true;await setup.query('USE '+name);
 for(const file of ['schema.sql','migrations/202609090002_auth_revocation.sql'])await setup.query(fs.readFileSync(path.join(__dirname,'../database',file),'utf8'));
 const [user]=await setup.query("INSERT INTO users(username,email,password_hash,role) VALUES ('Media QA','media-workflow@example.test','unused','admin')");
 db=require('../src/db');
 // Evaluate the real route with its real dependencies, only relocating its uploads directory.
 const routeFile=require.resolve('../src/routes/upload'),m={exports:{}};
 new Function('require','module','__dirname',fs.readFileSync(routeFile,'utf8'))(require('node:module').createRequire(routeFile),m,path.join(fixture,'server/src/routes'));
 const express=require('express'),app=express();app.use(express.json());app.use('/api/upload',m.exports.router);app.use('/api/posts',require('../src/routes/posts'));server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const origin='http://127.0.0.1:'+server.address().port,token=require('jsonwebtoken').sign({id:user.insertId,sessionStartedAt:Date.now()},process.env.JWT_SECRET);
 const request=async(url,method='GET',body)=>{const r=await fetch(origin+'/api'+url,{method,headers:{Authorization:'Bearer '+token,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};};
 const ok=async(...args)=>{const r=await request(...args);assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
 const data=await sharp({create:{width:2201,height:821,channels:3,background:'#777'}}).png().toBuffer();
 const form=new FormData();form.append('quality','original');form.append('image',new Blob([data],{type:'image/png'}),'workflow.png');
 const uploaded=await ok('/upload/image','POST',form);
 const [post]=await setup.query("INSERT INTO posts(title,slug,content,cover_image,status,author_id) VALUES ('Media','media',?,?,'published',?)",['![test]('+uploaded.url+')',uploaded.url,user.insertId]);
 const check=async file=>{
  const [[row]]=await setup.query('SELECT * FROM media_assets WHERE filename=?',[file]);assert(row);
  const bytes=fs.readFileSync(path.join(m.exports.uploadDir,file)),actual=await sharp(bytes).metadata();
  assert.equal(row.width,actual.width);assert.equal(row.height,actual.height);assert.equal(row.size,bytes.length);
  const article=await ok('/posts/'+post.insertId);assert.equal(article.cover_image,row.url);assert.equal(article.content,'![test]('+row.url+')');
  assert.deepEqual(article.image_dimensions[row.url],{width:actual.width,height:actual.height});return row;
 };
 await check(uploaded.filename);
 const renamed=await ok('/upload/media/'+uploaded.filename+'/rename','PUT',{filename:'workflow-renamed.png'});assert.equal(renamed.filename,'workflow-renamed.png');assert(!fs.existsSync(path.join(m.exports.uploadDir,uploaded.filename)));await check(renamed.filename);
 let media=await ok('/upload/media/'+renamed.filename+'/recompress','POST',{quality:'high'});assert.equal(media.width,2200);await check(media.filename);
 const webp=media.filename;
 media=await ok('/upload/media/'+webp+'/recompress','POST',{quality:'medium'});assert.equal(media.filename,webp);assert.equal(media.width,1600);await check(media.filename);
 media=await ok('/upload/media/'+webp+'/recompress','POST',{quality:'low'});assert.equal(media.width,1200);await check(media.filename);
 const final=await ok('/upload/media/'+webp+'/rename','PUT',{filename:'workflow-final.webp'});await check(final.filename);
 const before=fs.readFileSync(path.join(m.exports.uploadDir,final.filename));
 assert.equal((await request('/upload/media/'+final.filename+'/rename','PUT',{filename:'wrong.jpg'})).status,400);
 assert.equal((await request('/upload/media/'+final.filename+'/recompress','POST',{quality:'original'})).status,400);
 const collision=path.join(m.exports.uploadDir,'occupied.webp');fs.writeFileSync(collision,before);
 assert.equal((await request('/upload/media/'+final.filename+'/rename','PUT',{filename:'occupied.webp'})).status,409);
 assert.deepEqual(fs.readFileSync(path.join(m.exports.uploadDir,final.filename)),before);await check(final.filename);
 assert.equal((await setup.query('SELECT COUNT(*) n FROM media_assets'))[0][0].n,1);
 const revisions=(await setup.query('SELECT payload FROM article_revisions WHERE post_id=? ORDER BY id',[post.insertId]))[0];assert(revisions.length>=2);
 const last=typeof revisions.at(-1).payload==='string'?JSON.parse(revisions.at(-1).payload):revisions.at(-1).payload;assert.equal(last.cover_image,final.url);
 const repair=require('../../scripts/repair-media-dimensions.cjs').repair,backups=path.join(fixture,'backups');
 const stale=['import-c75fb0e91471-bfafc384e05b5c98e6e9.webp','import-c75fb0e91471-afe92a9c8e9e0e02575f.webp'];
 for(const filename of stale){fs.writeFileSync(path.join(m.exports.uploadDir,filename),before);await setup.query("INSERT INTO media_assets(filename,url,width,height,status) VALUES (?, ?,2201,821,'active')",[filename,'/api/uploads/'+filename]);}
 const config={db,sharp,uploads:m.exports.uploadDir,backups};
 assert.equal((await repair(config)).changes.length,2);assert(!fs.existsSync(backups),'dry run must not create a backup or write metadata');
 const fixed=await repair({...config,apply:true});assert.equal(fixed.changes.length,2);assert(fs.existsSync(fixed.backupFile));
 assert.equal((await repair({...config,apply:true})).changes.length,0,'repair must be idempotent');
 for(const filename of stale)assert.deepEqual(fs.readFileSync(path.join(m.exports.uploadDir,filename)),before);
 await repair({...config,rollback:fixed.backupFile});assert.equal((await setup.query('SELECT width FROM media_assets WHERE filename=?',[stale[0]]))[0][0].width,2201);
 const repairedAgain=await repair({...config,apply:true});await setup.query('UPDATE media_assets SET width=123 WHERE filename=?',[stale[0]]);
 await assert.rejects(repair({...config,rollback:repairedAgain.backupFile}),/changed after repair/);
});

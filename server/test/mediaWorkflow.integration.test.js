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
 const proof=require('../src/lib/articleSummaryProof'),draftId=require('node:crypto').randomUUID();
 const payload={title:'Media',slug:'media',content:'![test]('+uploaded.url+')',cover_image:uploaded.url,summary:'Approved description',summary_mode:'ai',category:'',tags:[]};payload.summary_receipt=proof.signature(payload);
 await setup.query('INSERT INTO article_drafts(id,author_id,post_id,base_version,payload,dirty,published_version) VALUES (?,?,?,1,?,0,1)',[draftId,user.insertId,post.insertId,JSON.stringify(payload)]);
 await setup.query("INSERT INTO article_workflows(draft_id,state,draft_version,snapshot,scheduled_at) VALUES (?,'scheduled',1,?,?)",[draftId,JSON.stringify(payload),Date.now()+86400000]);
 await setup.query("INSERT INTO updates(content,image_url,author_id,status) VALUES (?, ?,?,'published')",['![test]('+uploaded.url+')',uploaded.url,user.insertId]);
 await setup.query("INSERT INTO projects(slug,name,summary,content,cover_image,icon_image,tech_stack,status) VALUES ('fixture','Fixture','summary',?,?,?,'','published')",['![test]('+uploaded.url+')',uploaded.url,uploaded.url]);
 await setup.query("INSERT INTO article_series(slug,title,description,cover_image) VALUES ('fixture','Fixture','',?)",[uploaded.url]);
 await setup.query('INSERT INTO site_now(id,content) VALUES (1,?)',['![test]('+uploaded.url+')']);
 assert.equal((await request('/upload/media/'+uploaded.filename,'DELETE')).status,409,'active content and hidden snapshots protect an image from deletion');
 const referencesAligned=async url=>{
  for(const [table,fields] of [['updates',['content','image_url']],['projects',['content','cover_image','icon_image']],['article_series',['cover_image']],['site_now',['content']]]){
   const [[row]]=await setup.query('SELECT '+fields.join(',')+' FROM '+table+' LIMIT 1');for(const field of fields)assert(row[field].includes(url),table+'.'+field);
  }
  const [[draft]]=await setup.query('SELECT * FROM article_drafts WHERE id=?',[draftId]);const p=typeof draft.payload==='string'?JSON.parse(draft.payload):draft.payload;assert.equal(p.cover_image,url);assert.ok(proof.valid(p));assert.equal(draft.dirty,0);assert.equal(draft.published_version,draft.version);
  const [[w]]=await setup.query('SELECT * FROM article_workflows WHERE draft_id=?',[draftId]);const snap=typeof w.snapshot==='string'?JSON.parse(w.snapshot):w.snapshot;assert.equal(w.state,'scheduled');assert.equal(w.draft_version,draft.version);assert.equal(snap.cover_image,url);assert.ok(proof.valid(snap));
  const [[publicPost]]=await setup.query('SELECT version FROM posts WHERE id=?',[post.insertId]);assert.equal(draft.base_version,publicPost.version);
  const [history]=await setup.query('SELECT payload,content_hash FROM article_revisions WHERE post_id=?',[post.insertId]);for(const r of history){const p=typeof r.payload==='string'?JSON.parse(r.payload):r.payload;assert.equal(p.cover_image,url);assert.equal(r.content_hash,require('../src/lib/articleRevisions').hash(p));}
 };
 const check=async file=>{
  const [[row]]=await setup.query('SELECT * FROM media_assets WHERE filename=?',[file]);assert(row);
  const bytes=fs.readFileSync(path.join(m.exports.uploadDir,file)),actual=await sharp(bytes).metadata();
  assert.equal(row.width,actual.width);assert.equal(row.height,actual.height);assert.equal(row.size,bytes.length);
  const article=await ok('/posts/'+post.insertId);assert.equal(article.cover_image,row.url);assert.equal(article.content,'![test]('+row.url+')');
  assert.deepEqual(article.image_dimensions[row.url],{width:actual.width,height:actual.height});return row;
 };
 await check(uploaded.filename);
 const renamed=await ok('/upload/media/'+uploaded.filename+'/rename','PUT',{filename:'workflow-renamed.png'});assert.equal(renamed.filename,'workflow-renamed.png');assert(!fs.existsSync(path.join(m.exports.uploadDir,uploaded.filename)));await check(renamed.filename);
 await referencesAligned(renamed.url);
 const getConnection=db.getConnection.bind(db);db.getConnection=async()=>{const c=await getConnection(),query=c.query.bind(c),release=c.release.bind(c);c.query=async(sql,...args)=>{if(sql.startsWith('UPDATE media_assets SET filename='))throw Error('Injected metadata failure');return query(sql,...args);};c.release=()=>{c.query=query;release();};return c;};
 try{assert.equal((await request('/upload/media/'+renamed.filename+'/rename','PUT',{filename:'failed-rename.png'})).status,500);}
 finally{db.getConnection=getConnection;}
 assert(fs.existsSync(path.join(m.exports.uploadDir,renamed.filename)));assert(!fs.existsSync(path.join(m.exports.uploadDir,'failed-rename.png')));await referencesAligned(renamed.url);
 let media=await ok('/upload/media/'+renamed.filename+'/recompress','POST',{quality:'high'});assert.equal(media.width,2200);await check(media.filename);
 await referencesAligned(media.url);
 const webp=media.filename;
 media=await ok('/upload/media/'+webp+'/recompress','POST',{quality:'medium'});assert.equal(media.filename,webp);assert.equal(media.width,1600);await check(media.filename);
 media=await ok('/upload/media/'+webp+'/recompress','POST',{quality:'low'});assert.equal(media.width,1200);await check(media.filename);
 const final=await ok('/upload/media/'+webp+'/rename','PUT',{filename:'workflow-final.webp'});await check(final.filename);
 await referencesAligned(final.url);
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

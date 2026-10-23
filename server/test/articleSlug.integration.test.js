const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');

test('article slug migration, write transactions and public projections on isolated MySQL',{skip:process.env.SLUG_INTEGRATION!=='true'},async t=>{
 const name='mooncci_qa_slug_'+process.pid,conflictName=name+'_conflict',port=Number(process.env.TEST_DB_PORT||33079);
 const templateDir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'mooncci-slug-')),template=path.join(templateDir,'index.html');
 fs.writeFileSync(template,'<html><head></head><body><div id="root"></div></body></html>');
 t.after(()=>{fs.unlinkSync(template);fs.rmdirSync(templateDir);});
 Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:String(port),DB_USER:'root',DB_PASSWORD:'',DB_NAME:name,JWT_SECRET:'slug-test-secret-only-more-than-32-chars',SITE_URL:'https://mooncci.site',CSRF_TRUSTED_ORIGINS:'https://mooncci.site',PUBLISHING_ENABLED:'true',ENGAGEMENT_ENABLED:'true',MAIL_ENABLED:'false',NEWSLETTER_DELIVERY_ENABLED:'false',GITHUB_SYNC_ENABLED:'false',ACCOUNT_OPERATIONS_ENABLED:'false',SEO_HTML_TEMPLATE:template});
 const mysql=require('mysql2/promise'),options={host:'127.0.0.1',port,user:'root',password:'',multipleStatements:true},setup=await mysql.createConnection(options),databases=[];
 let db,platform,server;
 t.after(async()=>{
  if(server)await new Promise(r=>server.close(r));
  if(db)await db.end();if(platform)await platform.end();
  for(const database of databases)await setup.query('DROP DATABASE '+database);
  await setup.end();
 });
 const schema=fs.readFileSync(path.join(__dirname,'../database/schema.sql'),'utf8'),migration=fs.readFileSync(path.join(__dirname,'../database/migrations/202610230001_article_slug_aliases.sql'),'utf8');
 async function create(database){await setup.query('CREATE DATABASE '+database+' CHARACTER SET utf8mb4');databases.push(database);await setup.query('USE '+database);await setup.query(schema);}
 await create(name);
 await setup.query(fs.readFileSync(path.join(__dirname,'../database/migrations/202609090002_auth_revocation.sql'),'utf8'));
 await setup.query('DROP TABLE article_slug_aliases');
 const users={};for(const role of ['owner','editor','user']){const [r]=await setup.query('INSERT INTO users(username,email,password_hash,role) VALUES (?,?,?,?)',[role,role+'@example.test','unused',role]);users[role]=r.insertId;}
 const oldSlug='cities:skylinesii-basic-mod',targetSlug='cities-skylines-2-basic-mods',title='Cities: Skylines II 都市天际线2 基础Mod推荐';
 for(const [id,slug,status] of [[20,oldSlug,'published'],[21,'private-article','draft'],[22,'neighbor-post','published'],[23,'parallel-post','published'],[24,'stable-old-name','published'],[25,'deleted-name','published'],[26,'rollback-original','published']])await setup.query('INSERT INTO posts(id,title,slug,summary,summary_mode,content,status,author_id,published_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',[id,id===20?title:'Article '+id,slug,'Manual description','manual','Public body '+id,status,users.owner,'2024-01-01 12:00:00','2024-01-02 12:00:00']);
 const draftId=crypto.randomUUID(),payload={title,slug:oldSlug,content:'Unpublished body',summary:'Manual draft',summary_mode:'manual'};
 await setup.query('INSERT INTO article_drafts(id,author_id,post_id,base_version,payload) VALUES (?,?,?,?,?)',[draftId,users.owner,20,1,JSON.stringify(payload)]);
 await setup.query("INSERT INTO article_revisions(post_id,actor_id,kind,payload,content_hash,published_version) VALUES (?,?,'baseline',?,?,1)",[20,users.owner,JSON.stringify(payload),'a'.repeat(64)]);
 const originalDate=(await setup.query('SELECT updated_at FROM posts WHERE id=20'))[0][0].updated_at;
 const beforeDraft=(await setup.query('SELECT * FROM article_drafts WHERE id=?',[draftId]))[0],beforeRevisions=(await setup.query('SELECT * FROM article_revisions WHERE post_id=20'))[0],beforePrivate=(await setup.query('SELECT * FROM posts WHERE id=21'))[0];
 await t.test('migration is repeatable and preserves dates, private posts, drafts and revisions',async()=>{
  await setup.query(migration);await setup.query(migration);
  const [[p]]=await setup.query('SELECT slug,version,updated_at FROM posts WHERE id=20');assert.equal(p.slug,targetSlug);assert.equal(p.version,2);assert.deepEqual(p.updated_at,originalDate);
  assert.deepEqual((await setup.query('SELECT * FROM article_drafts WHERE id=?',[draftId]))[0],beforeDraft);assert.deepEqual((await setup.query('SELECT * FROM article_revisions WHERE post_id=20'))[0],beforeRevisions);assert.deepEqual((await setup.query('SELECT * FROM posts WHERE id=21'))[0],beforePrivate);
  const [aliases]=await setup.query('SELECT slug,post_id FROM article_slug_aliases WHERE post_id=20 ORDER BY slug');assert.equal(aliases.length,2);assert.deepEqual(new Set(aliases.map(a=>a.slug)),new Set([oldSlug,targetSlug]));
 });
 await t.test('conflicting migration rolls back every seeded alias on disconnect',async()=>{
  await create(conflictName);
  await setup.query("INSERT INTO users(id,username,email,password_hash,role) VALUES (1,'owner','conflict@example.test','unused','owner')");
  await setup.query("INSERT INTO posts(id,title,slug,content,status,author_id) VALUES (20,?,?,?,'published',1),(22,'Other','occupied-current','Body','published',1)",[title,oldSlug,'Body']);
  await setup.query('INSERT INTO article_slug_aliases(slug,post_id) VALUES (?,22)',[targetSlug]);
  const c=await mysql.createConnection({...options,database:conflictName});try{await assert.rejects(()=>c.query(migration),e=>e.code==='ER_DUP_ENTRY');}finally{await c.end();}
  const [[p]]=await setup.query('SELECT slug,version FROM posts WHERE id=20');assert.deepEqual(p,{slug:oldSlug,version:1});
  assert.deepEqual((await setup.query('SELECT slug,post_id FROM article_slug_aliases'))[0],[{slug:targetSlug,post_id:22}]);
  await setup.query('USE '+name);
 });
 db=require('../src/db');platform=require('../src/platformDb');
 const jwt=require('jsonwebtoken'),cookie=role=>'mooncci_token='+jwt.sign({id:users[role],sessionStartedAt:Date.now()},process.env.JWT_SECRET);
 server=require('../src/index').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const request=(url,method='GET',body,role='owner')=>fetch(base+url,{method,redirect:'manual',headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest',Origin:'https://mooncci.site',Cookie:role?cookie(role):''},...(body?{body:JSON.stringify(body)}:{})});
 async function ok(url,method,body,role){const r=await request(url,method,body,role),data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;}
 const edit=(id,slug,version=1,role='owner')=>request('/api/posts/'+id,'PUT',{slug,version,summary_mode:'manual'},role);
 await t.test('numeric and historical references resolve; only public HTML redirects canonically',async()=>{
  for(const reference of ['20',encodeURIComponent(oldSlug),targetSlug]){const post=await ok('/api/posts/'+reference,'GET',null,null);assert.equal(post.id,20);assert.equal(post.slug,targetSlug);}
  for(const reference of ['20',encodeURIComponent(oldSlug)]){const r=await request('/article/'+reference+'?utm_source=old','GET',null,null);assert.equal(r.status,301);assert.equal(r.headers.get('location'),'/article/'+targetSlug+'?utm_source=old');}
  assert.equal((await request('/api/posts/private-article','GET',null,null)).status,404);
  assert.equal((await request('/api/posts/private-article')).status,200);
  const hidden=await request('/article/private-article');assert.equal(hidden.status,404);assert.equal(hidden.headers.get('location'),null);assert.doesNotMatch(await hidden.text(),/Public body 21/);
  for(const url of ['/api/posts/%ZZ','/article/%ZZ'])assert.equal((await request(url)).status,400,url);
  const meta=await ok('/api/seo?path='+encodeURIComponent('/article/20'));assert.equal(meta.canonical,'https://mooncci.site/article/'+targetSlug);
  assert.equal((await edit(24,'unauthorized-name',1,'editor')).status,403);
 });
 await t.test('renames preserve history and competing claims cannot steal an alias',async()=>{
  assert.equal((await edit(24,'stable-new-name')).status,200);
  for(const reference of ['24','stable-old-name','stable-new-name'])assert.equal((await ok('/api/posts/'+reference)).slug,'stable-new-name');
  const results=await Promise.all([edit(22,'competing-name'),edit(23,'competing-name')]);assert.deepEqual(results.map(r=>r.status).sort(),[200,422]);
  const [[alias]]=await db.query("SELECT post_id FROM article_slug_aliases WHERE slug='competing-name'");const winner=Number(alias.post_id),loser=winner===22?23:22;
  assert.equal((await ok('/api/posts/competing-name')).id,winner);
  const [[loserPost]]=await db.query('SELECT slug,version FROM posts WHERE id=?',[loser]);assert.deepEqual(loserPost,{slug:loser===22?'neighbor-post':'parallel-post',version:1});
  assert.equal((await edit(24,'stale-version',1)).status,409);
 });
 await t.test('late revision failure rolls back the post and the newly claimed alias',async()=>{
  await db.query("CREATE TRIGGER slug_test_revision_failure BEFORE INSERT ON article_revisions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='forced slug transaction failure'");
  try{assert.equal((await edit(26,'must-roll-back')).status,500);}finally{await db.query('DROP TRIGGER slug_test_revision_failure');}
  const [[post]]=await db.query('SELECT slug,version FROM posts WHERE id=26');assert.deepEqual(post,{slug:'rollback-original',version:1});
  assert.equal((await db.query("SELECT * FROM article_slug_aliases WHERE slug='must-roll-back'"))[0].length,0);
  assert.equal((await db.query("SELECT post_id FROM article_slug_aliases WHERE slug='rollback-original'"))[0][0].post_id,26);
 });
 await t.test('deleted aliases remain reserved and cannot be reused',async()=>{
  assert.equal((await request('/api/posts/25','DELETE')).status,200);
  const [[alias]]=await db.query("SELECT post_id FROM article_slug_aliases WHERE slug='deleted-name'");assert.equal(alias.post_id,null);
  assert.equal((await request('/api/posts/deleted-name','GET',null,null)).status,404);
  assert.equal((await edit(26,'deleted-name')).status,422);
 });
 async function draft(slug,role='owner'){return ok('/api/article-drafts','POST',{id:crypto.randomUUID(),payload:{title:'Draft article',content:'Draft body',slug,summary:'Manual description',summary_mode:'manual'}},role);}
 await t.test('blank drafts save, but publish/submit reject blanks without changing the draft',async()=>{
  const d=await draft(''),before=(await db.query('SELECT * FROM article_drafts WHERE id=?',[d.id]))[0];
  assert.equal((await request('/api/article-drafts/'+d.id+'/publish','POST',{version:d.version})).status,400);
  assert.equal((await request('/api/publishing/'+d.id+'/submit','POST',{version:d.version})).status,400);
  assert.deepEqual((await db.query('SELECT * FROM article_drafts WHERE id=?',[d.id]))[0],before);
  const contributor=await draft('','user');assert.equal((await request('/api/publishing/'+contributor.id+'/submit','POST',{version:contributor.version},'user')).status,400);
 });
 await t.test('draft publication reserves its slug atomically; stale and duplicate publications do not write',async()=>{
  const d=await draft('published-from-draft');const published=await ok('/api/article-drafts/'+d.id+'/publish','POST',{version:d.version});assert.ok(published.post_id);
  assert.equal((await ok('/api/posts/published-from-draft','GET',null,null)).id,published.post_id);
  const [[alias]]=await db.query('SELECT post_id FROM article_slug_aliases WHERE slug=?',['published-from-draft']);assert.equal(alias.post_id,published.post_id);
  const collision=await draft('deleted-name'),[[count]]=await db.query('SELECT COUNT(*) total FROM posts');assert.equal((await request('/api/article-drafts/'+collision.id+'/publish','POST',{version:collision.version})).status,422);assert.equal((await db.query('SELECT COUNT(*) total FROM posts'))[0][0].total,count.total);assert.equal((await db.query('SELECT post_id FROM article_drafts WHERE id=?',[collision.id]))[0][0].post_id,null);
  const occupied=await draft('stable-new-name');assert.equal((await request('/api/article-drafts/'+occupied.id+'/publish','POST',{version:occupied.version})).status,422);
  const corrected=await ok('/api/article-drafts/'+occupied.id,'PUT',{version:occupied.version,payload:{...occupied.payload,slug:'corrected-unused-name'}});
  const recovered=await ok('/api/article-drafts/'+occupied.id+'/publish','POST',{version:corrected.version});assert.ok(recovered.post_id);assert.equal((await ok('/api/posts/corrected-unused-name')).id,recovered.post_id);
  const stale=await ok('/api/article-drafts/'+draftId,'PUT',{version:1,payload:{...payload,slug:targetSlug}});
  assert.equal((await request('/api/article-drafts/'+draftId+'/publish','POST',{version:stale.version})).status,409);
 });
 await t.test('feed, bookmarks, series, history and comment notifications expose current public slugs only',async()=>{
  const {activity}=require('../src/repositories/activityRepository'),feed=await activity({type:'post',pageSize:100});assert.ok(feed.items.length);for(const item of feed.items)assert.equal(item.path,require('../src/lib/articleSlug').articlePath(item));assert.ok(!feed.items.some(p=>p.id===21));
  await db.query('INSERT INTO article_bookmarks(user_id,post_id) VALUES (?,20),(?,21)',[users.user,users.user]);
  const bookmarks=await ok('/api/bookmarks','GET',null,'user'),publicBookmark=bookmarks.items.find(x=>x.post_id===20),privateBookmark=bookmarks.items.find(x=>x.post_id===21);assert.equal(publicBookmark.slug,targetSlug);assert.equal(privateBookmark.available,false);assert.equal('slug' in privateBookmark,false);assert.equal('title' in privateBookmark,false);
  const [series]=await db.query("INSERT INTO article_series(title,slug,description) VALUES ('Test series','slug-series','Description')");
  for(const [id,position] of [[20,0],[21,1],[24,2]])await db.query('INSERT INTO article_series_posts(post_id,series_id,position) VALUES (?,?,?)',[id,series.insertId,position]);
  const publicSeries=await ok('/api/series/slug-series','GET',null,null);assert.deepEqual(publicSeries.items.map(x=>x.slug),[targetSlug,'stable-new-name']);
  const navigation=await ok('/api/series/article/20','GET',null,null);assert.equal(navigation.next.slug,'stable-new-name');
  const managed=await ok('/api/series/manage/'+series.insertId+'/articles');assert.equal(managed.items.find(x=>x.id===21).slug,'private-article');
  await db.query('INSERT INTO article_reading_history(user_id,post_id,updated_at) VALUES (?,20,?),(?,21,?)',[users.user,Date.now(),users.user,Date.now()]);
  const history=await ok('/api/engagement/history','GET',null,'user');assert.equal(history.items.length,1);assert.equal(history.items[0].slug,targetSlug);
  const [comment]=await db.query("INSERT INTO comments(post_id,user_id,content,status) VALUES (20,?,'Comment','visible')",[users.user]);
  const engagement=require('../src/services/engagement'),notification={post_id:20,comment_id:comment.insertId};assert.equal((await engagement.visible(db,notification)).url,'/article/'+targetSlug);
  await engagement.preferences(db,users.owner);await db.query("UPDATE engagement_preferences SET comment_email=1,verified_email='owner@example.test' WHERE user_id=?",[users.owner]);
  await engagement.commentEvent(db,comment.insertId);const sent=[];await engagement.runMail(async mail=>{sent.push(mail);return {sent:true};});assert.equal(sent.length,1);assert.ok(sent[0].text.includes('https://mooncci.site/article/'+targetSlug));
  await db.query("UPDATE posts SET status='draft' WHERE id=20");assert.deepEqual(await engagement.visible(db,notification),{available:false});
  assert.equal((await ok('/api/bookmarks','GET',null,'user')).items.find(x=>x.post_id===20).available,false);assert.equal((await ok('/api/engagement/history','GET',null,'user')).items.length,0);
 });
});

const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module'),req=createRequire(path.resolve('server/package.json'));
const {chromium,webkit}=require('playwright');
(async()=>{
 const name='mooncci_qa_visual_'+process.pid, port=Number(process.env.AUDIT_PORT||4203);
 Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:'33079',DB_USER:'root',DB_PASSWORD:'',DB_NAME:name,JWT_SECRET:'local-layout-audit-only-not-production',SITE_URL:'https://mooncci.site',ACCOUNT_OPERATIONS_ENABLED:'true',PUBLISHING_ENABLED:'true',ENGAGEMENT_ENABLED:'true',MAIL_ENABLED:'false',NEWSLETTER_DELIVERY_ENABLED:'false',GITHUB_SYNC_ENABLED:'false'});
 const db=await req('mysql2/promise').createConnection({host:'127.0.0.1',port:33079,user:'root',multipleStatements:true});
 let backend,preview,browser;
 try{
 await db.query('CREATE DATABASE '+name+' CHARACTER SET utf8mb4');await db.query('USE '+name);
 await db.query(fs.readFileSync('server/database/schema.sql','utf8'));await db.query(fs.readFileSync('server/database/migrations/202609090002_auth_revocation.sql','utf8'));
 const [owner]=await db.query("INSERT INTO users(username,email,password_hash,role) VALUES ('mooncci','visual@example.test','unused','owner')");
 const [author]=await db.query("INSERT INTO users(username,email,password_hash,role) VALUES ('山间写作者','author@example.test','unused','user')");
 const [post]=await db.query("INSERT INTO posts(title,slug,summary,content,tags,status,author_id,published_at) VALUES ('把路上的风景写下来','visual-article','一份关于观察与写作的记录。','## 出发之前\\n\\n放慢脚步，记录沿途的风景。\\n\\n## 记录片刻\\n\\n文字让平常的日子有迹可循。','[\"写作\"]','published',?,NOW())",[author.insertId]);
 await db.query("INSERT INTO updates(content,status,author_id,published_at) VALUES ('今天整理了一些照片和写作笔记。','published',?,NOW())",[owner.insertId]);
 await db.query("INSERT INTO projects(slug,name,summary,content,tech_stack,status) VALUES ('visual-project','写作手记','收集平日的观察与思考。','## 关于项目\\n\\n一个持续更新的记录。','[]','published')");
 await db.query('INSERT INTO article_bookmarks(user_id,post_id) VALUES (?,?)',[owner.insertId,post.insertId]);
 const draft='11111111-1111-4111-8111-111111111111',payload={title:'测试投稿功能',content:'## 这篇稿件的正文\n\n确认内容与图片后，选择审核结果。\n\n文字的层级、行宽与段落间距应当便于阅读。',tags:[],summary:'一份待审核的作者投稿。'};
 await db.query('INSERT INTO article_drafts(id,author_id,payload) VALUES (?,?,?)',[draft,owner.insertId,JSON.stringify(payload)]);
 await db.query("INSERT INTO article_workflows(draft_id,state,draft_version,snapshot) VALUES (?,'approved',1,?)",[draft,JSON.stringify(payload)]);
 backend=require('../server/src/index').listen(0,'127.0.0.1');await new Promise(r=>backend.once('listening',r));
 preview=await (await import('vite')).preview({build:{outDir:process.env.QA_DIST||'dist'},preview:{host:'127.0.0.1',port,strictPort:true}});
 browser=process.env.QA_BROWSER==='webkit'?await webkit.launch({headless:true}):await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge',headless:true});
 let token='';
 const roles={owner:owner.insertId,user:author.insertId,guest:null};
 for(const role of ['editor','admin']){const [row]=await db.query("INSERT INTO users(username,email,password_hash,role) VALUES (?,?,?,?)",[role,role+'@example.test','unused',role]);roles[role]=row.insertId;}
 const cache=new Map(),failures=[],results=[],directory=process.env.AUDIT_OUTPUT||'.cache/layout-audit';fs.mkdirSync(directory,{recursive:true});
 const source=fs.readFileSync('src/app/App.tsx','utf8');const routes=[...new Set([...source.matchAll(/<Route path="([^"]+)"/g)].map(m=>m[1]))].filter(p=>p!=='*'&&p!=='/account/connections');
 const substitute=p=>p==='/account/write'||p==='/admin/write'?p+'?draft='+draft:p.replace(':slug',p.startsWith('/series')?'missing-series':'visual-project').replace(':tag','写作').replace(':category','未分类').replace(':action','confirm').replace(':id',p.startsWith('/admin/users')?String(owner.insertId):String(post.insertId));
 for(const role of (process.env.AUDIT_ROLES||'owner').split(',')) for(const mode of (process.env.AUDIT_MODES||'desktop,mobile,dark').split(',')){
 cache.clear();token=roles[role]?req('jsonwebtoken').sign({id:roles[role],sessionStartedAt:Date.now()},process.env.JWT_SECRET):'';
 const context=await browser.newContext({viewport:{width:mode==='mobile'?390:1440,height:1000}});
 if(mode==='dark')await context.addInitScript(()=>{try{localStorage.setItem('mooncci-theme','dark')}catch{}});
 const page=await context.newPage();let current='',errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
 const request=route.request(),u=new URL(request.url());
 if(u.hostname!=='127.0.0.1'&&u.hostname!=='localhost')return route.abort();
 if(!u.pathname.startsWith('/api/'))return route.continue();
 const key=request.method()+u.pathname+u.search;
 if(u.pathname==='/api/auth/me'&&['/login','/register','/forgot-password','/reset-password','/admin-login','/complete-registration'].includes(current))return route.fulfill({json:{user:null}});
 if(request.method()!=='GET'&&!u.pathname.includes('draft'))return route.fulfill({json:{ok:true}});
 if(u.pathname.includes('weather'))return route.fulfill({status:503,json:{message:'本地界面审查未连接天气服务'}});
 if(cache.has(key)){const cached=cache.get(key);return route.fulfill(cached);}
 const response=await fetch('http://127.0.0.1:'+backend.address().port+u.pathname+u.search,{method:request.method(),body:request.postData()||undefined,headers:{'Content-Type':'application/json',Cookie:'mooncci_token='+token,'X-Requested-With':'XMLHttpRequest',Origin:'https://mooncci.site'}});
 const body=await response.text(),value={status:response.status,contentType:response.headers.get('content-type')||'application/json',body};
 cache.set(key,value);if(response.status>=500)failures.push({path:u.pathname,status:response.status});return route.fulfill(value);
 });
 for(let i=0;i<routes.length;i++){
 const route=routes[i];current=route;errors=[];
 await page.goto('http://127.0.0.1:'+port+substitute(route),{waitUntil:'networkidle'});
 await page.waitForTimeout(160);
 const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,heading:document.querySelector('h1')?.textContent,theme:document.documentElement.dataset.moonTheme,selects:[...document.querySelectorAll('select')].filter(el=>el.getAttribute('aria-hidden')!=='true'&&el.getClientRects().length).length}));
 const file=role+'-'+mode+'-'+String(i).padStart(2,'0')+'.png';await page.screenshot({path:directory+'/'+file,animations:'disabled'});
 results.push({role,route,finalUrl:page.url(),mode,file,...metrics,errors:[...errors]});
 }
 await context.close();console.log('Audited '+role+' '+mode+': '+routes.length+' routes');
 }
 fs.writeFileSync(directory+'/report.json',JSON.stringify({results,apiFailures:failures},null,2));
 console.log(JSON.stringify({routes:routes.length,views:results.length,issues:results.filter(r=>r.overflow||r.errors.length||r.selects),apiFailures:failures},null,2));
 }finally{if(browser)await browser.close();if(preview)await new Promise(r=>preview.httpServer.close(r));if(backend){await new Promise(r=>backend.close(r));await require('../server/src/db').end();await require('../server/src/platformDb').end();}await db.query('DROP DATABASE IF EXISTS '+name);await db.end();}
})().catch(e=>{console.error(e);process.exitCode=1;});

// Actual application routes, isolated HTTP fixtures; never connects to production.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(process.env.INTERACTION_EVIDENCE||'.cache/interaction-feedback/browser');
fs.mkdirSync(root,{recursive:true});
const origin=process.env.INTERACTION_ORIGIN||'http://127.0.0.1:4283';
assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin),'Only loopback acceptance is allowed');
const report={origin,cases:[],videos:[],errors:[],expectedFailures:[],mutations:[],productionRequests:0,blockedRequests:[]};
const user={id:9000,username:'本地验收',email:'local@example.test',role:'owner'};
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="seagreen"/><text x="100" y="400" fill="white" font-size="60">Local image fixture</text></svg>';
const content='## 图片交互验收\n\n'+Array.from({length:8},(_,i)=>'第'+(i+1)+'段，检查阅读位置与正文布局。').join('\n\n')+'\n\n![第一张](/interaction-fixtures/fast.svg)\n\n![慢图](/interaction-fixtures/slow.svg)\n\n![失败图](/interaction-fixtures/broken.svg)\n\n[![链接图](/interaction-fixtures/linked.svg)](/articles)';
const comment={id:1,post_id:1,user_id:9000,parent_id:null,reply_to_user_id:null,content:'本地评论，测试不会写入服务器。',status:'visible',created_at:'2026-10-16T01:00:00Z',author_name:'本地验收',author_role:'owner',like_count:0,liked_by_me:false};
let browser,server;
async function fixture(options={}){
 const context=await browser.newContext({viewport:options.viewport||{width:1440,height:900},isMobile:!!options.mobile,hasTouch:!!options.mobile,reducedMotion:options.reduced?'reduce':'no-preference',colorScheme:options.dark?'dark':'light',recordVideo:{dir:path.join(root,'videos'),size:options.mobile?{width:390,height:844}:{width:1440,height:900}}});
 await context.addInitScript(({dark,localReduced,noWAAPI})=>{try{localStorage.setItem('mooncci-theme',dark?'dark':'light');localStorage.setItem('mooncci-reading',JSON.stringify({reduceMotion:localReduced}));}catch{}if(noWAAPI)Element.prototype.animate=undefined;},{dark:!!options.dark,localReduced:!!options.localReduced,noWAAPI:!!options.noWAAPI});
 const state={slow:true,broken:true,imageSize:[1200,800],bookmark:false,bookmarkFail:false,commentFail:false,writeDelay:300,comments:[structuredClone(comment),{...structuredClone(comment),id:2,user_id:9001,author_name:'另一位读者'}],requests:[],pendingImages:[]};
 state.releaseImages=()=>{state.slow=false;state.pendingImages.splice(0).forEach(resolve=>resolve());};
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),method=request.method();
  if(url.origin!==origin){report.blockedRequests.push({url:request.url(),method});return route.abort('blockedbyclient');}
  if(url.pathname.startsWith('/interaction-fixtures/')){
   if(url.pathname.endsWith('/slow.svg')&&state.slow)await new Promise(resolve=>state.pendingImages.push(resolve));
   const fail=url.pathname.endsWith('/broken.svg')&&state.broken;if(fail)report.expectedFailures.push({kind:'image',url:url.pathname,status:503});
   return route.fulfill({status:fail?503:200,contentType:'image/svg+xml',body:fail?'Unavailable':svg.replace('width="1200" height="800"',`width="${state.imageSize[0]}" height="${state.imageSize[1]}"`),headers:{'Cache-Control':'no-store'}}).catch(()=>{});
  }
  if(!url.pathname.startsWith('/api/'))return route.continue();
  const key=url.pathname.slice(4);state.requests.push({key,method,body:request.postData()});
  const json=data=>route.fulfill({json:data});
  if(method!=='GET'&&method!=='HEAD'){
   report.mutations.push({key,method,body:request.postData()});
   await new Promise(resolve=>setTimeout(resolve,state.writeDelay));
   if(key.startsWith('/bookmarks/')){if(state.bookmarkFail){report.expectedFailures.push({kind:'bookmark',status:503});return route.fulfill({status:503,json:{message:'Injected bookmark failure'}});}state.bookmark=method==='PUT';return json({bookmarked:state.bookmark});}
   if(key==='/comments/post/1'){if(state.commentFail){report.expectedFailures.push({kind:'comment',status:400});return route.fulfill({status:400,json:{message:'本地模拟提交失败，请重试'}});}state.comments.push({...structuredClone(comment),id:state.comments.length+1,...request.postDataJSON()});return json({message:'评论已提交'});}
   if(/^\/comments\/\d+\/like$/.test(key)){const item=state.comments.find(item=>item.id===Number(key.split('/')[2]));item.liked_by_me=method==='POST';item.like_count=item.liked_by_me?1:0;return json({});}
   if(/^\/comments\/\d+$/.test(key)&&method==='DELETE'){state.comments=state.comments.filter(item=>item.id!==Number(key.split('/')[2]));return json({message:'评论已删除'});}
   return json({disabled:true});
  }
  if(key==='/auth/session')return json({user});
  if(key==='/settings/site')return json({brand:{name:'mooncci'},hero:{},footer:{}});
  if(key==='/engagement/config')return json({enabled:true});
  if(key==='/publishing/config')return json({enabled:false});
  if(key==='/bookmark-folders')return json({items:[]});
  if(key==='/admin/posts')return json({items:[{id:1,title:'本地菜单验收',summary:'',category:'技术手记',author_name:user.username,status:'published',has_unpublished:0}],total:1,page:1,pageSize:50});
  if(key==='/article-drafts')return json({items:[],total:0,page:1,pageSize:20});
  if(key==='/bookmarks')return json({items:[],total:0,page:1,pageSize:20});
  if(key.startsWith('/bookmarks/'))return json({bookmarked:state.bookmark});
  if(/^\/posts\/\d+$/.test(key)){const id=Number(key.split('/')[2]);return json({id,title:'交互验收文章 '+id,content:id===2?content.replace('第一张','第二篇图片'):content,summary:'离线验收，图片和评论均为本地 fixture。',category:'技术手记',tags:[],author_name:'本地验收',published_at:'2026-10-16T01:00:00Z'});}
  if(key.endsWith('/discovery'))return json({related:[],previous:{id:1,title:'前一篇'},next:{id:2,title:'后一篇'}});
  if(key.startsWith('/series/article/'))return json(null);
  if(key.startsWith('/comments/post/'))return json(state.comments);
  if(key==='/activity'){
   const type=url.searchParams.get('type')||'all';await new Promise(resolve=>setTimeout(resolve,type==='post'?350:35));
   return json({items:[{activity_id:type+'-1',id:1,type:type==='all'?'update':type,path:'/article/1',title:'最终筛选 '+type,excerpt:'当前类型 '+type,published_at:'2026-10-16T01:00:00Z'}],total:30,page:Number(url.searchParams.get('page'))||1,pageSize:10});
  }
  if(key.startsWith('/analytics/'))return json({views:1});
  if(key.startsWith('/weather-mood'))return json({disabled:true});
  if(key==='/engagement/preferences')return json({history_enabled:false});
  return json({});
 });
 const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
 context.on('requestfinished',request=>{if(new URL(request.url()).origin!==origin)report.productionRequests++;});
 return{context,page,state,async close(){state.releaseImages();const video=page.video();await context.close();report.videos.push(await video.path());}};
}
async function run(name,callback,options){const f=await fixture(options);const row={name,passed:false};report.cases.push(row);try{await callback(f,row);row.passed=true;console.log('PASS '+name);}finally{await f.close();fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(report,null,2));}}
async function article(page,id=1){await page.goto(origin+'/article/'+id,{waitUntil:'domcontentloaded'});await page.locator('.markdown-body img[data-preview-image]').first().waitFor();}
async function openImage(page){const image=page.locator('.markdown-body img[data-preview-image]').first();await image.scrollIntoViewIfNeeded();await page.waitForTimeout(200);await image.focus();await page.keyboard.press('Enter');await page.getByRole('dialog',{name:'文章图片预览'}).waitFor();return image;}
const slide=page=>page.locator('.article-image-stage');
async function counter(page,value){await page.waitForFunction(value=>document.querySelector('.article-image-navigation [role=status]')?.textContent===value,value);}
(async()=>{try{
 if(!process.env.INTERACTION_ORIGIN)server=await(await import('vite')).preview({preview:{host:'127.0.0.1',port:4283,strictPort:true}});
 browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
 await run('image keyboard, focus trap, reading position, zoom and close',async({page,state},row)=>{
  state.releaseImages();await article(page);const image=await openImage(page);await page.waitForFunction(()=>document.querySelector('.article-image-stage')?.getAttribute('aria-busy')==='false');
  for(let i=0;i<9;i++){await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>!!document.activeElement?.closest('[role=dialog]')));}
  await page.getByRole('button',{name:'查看原始尺寸',exact:true}).click();await page.getByRole('button',{name:'适应窗口',exact:true}).click();
  const scroll=await page.evaluate(()=>scrollY);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await image.evaluate(el=>el===document.activeElement),true);assert.equal(await page.evaluate(()=>scrollY),scroll);
  await image.click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'关闭弹窗',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>document.body.style.pointerEvents),'');assert.notEqual(await page.evaluate(()=>getComputedStyle(document.body).overflow),'hidden');row.readingScroll=scroll;
 });
 await run('image opening keeps final geometry for portrait, landscape and square pictures',async({page,state},row)=>{
  state.releaseImages();state.broken=false;row.shapes=[];
  for(const width of [1440,390])for(const size of [[360,1200],[1200,800],[800,800]]){
   await page.setViewportSize({width,height:width===390?844:900});state.imageSize=size;await article(page);
   const image=page.locator('.markdown-body img[data-preview-image]').first();await image.scrollIntoViewIfNeeded();await page.waitForTimeout(100);
   await page.evaluate(()=>{window.__imageGeometry=[];const start=performance.now();function frame(){const image=document.querySelector('.article-image-stage img'),stage=document.querySelector('.article-image-stage');if(image&&stage&&stage.getAttribute('aria-busy')==='false'){const r=image.getBoundingClientRect();window.__imageGeometry.push({x:r.x,y:r.y,width:r.width,height:r.height,transform:getComputedStyle(image).transform,dialogTransform:getComputedStyle(image.closest('[role=dialog]')).transform,overflowX:stage.scrollWidth-stage.clientWidth,overflowY:stage.scrollHeight-stage.clientHeight});}if(performance.now()-start<450)requestAnimationFrame(frame);}requestAnimationFrame(frame);});
   await image.evaluate(el=>el.click());await page.waitForTimeout(500);const frames=await page.evaluate(()=>window.__imageGeometry);assert.ok(frames.length>=5);
   for(const key of ['x','y','width','height'])assert.ok(Math.max(...frames.map(f=>f[key]))-Math.min(...frames.map(f=>f[key]))<.5,`${width} ${size} ${key} must stay stable during fade`);
   assert.ok(frames.every(f=>f.transform==='none'&&f.dialogTransform==='none'&&f.overflowX<=1&&f.overflowY<=1));
   await page.getByRole('button',{name:'查看原始尺寸',exact:true}).click();await page.getByRole('button',{name:'适应窗口',exact:true}).click();assert.equal(await slide(page).locator('img').evaluate(el=>el.getAnimations().length),0,'zoom must not replay the entrance');
   row.shapes.push({viewport:width,size,frames:frames.length,first:frames[0],last:frames.at(-1)});await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  }
 });
 await run('slow images, failed image retry and rapid latest selection',async({page,state})=>{
  await article(page);await openImage(page);await page.keyboard.press('ArrowRight');await counter(page,'2 / 3');await page.getByText('正在加载图片…',{exact:true}).waitFor();
  await page.keyboard.press('ArrowRight');await counter(page,'3 / 3');await page.getByText('图片加载失败',{exact:true}).waitFor();
  state.releaseImages();await page.waitForTimeout(150);await counter(page,'3 / 3');assert.equal(await slide(page).locator('img').getAttribute('alt'),'失败图');
  state.broken=false;await page.getByRole('button',{name:'重试',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.article-image-stage')?.getAttribute('aria-busy')==='false');assert.equal(await page.getByText('图片加载失败',{exact:true}).count(),0);
  for(const key of ['ArrowLeft','ArrowLeft','ArrowRight','ArrowRight','ArrowLeft'])await page.keyboard.press(key);await counter(page,'2 / 3');await page.waitForTimeout(220);assert.equal(await slide(page).locator('img').getAttribute('alt'),'慢图');
 });
 await run('rapid reopen, linked picture exclusion and content navigation cleanup',async({page,state})=>{
  state.releaseImages();await article(page);assert.equal(await page.locator('.markdown-body a img').getAttribute('role'),null);assert.equal(await page.locator('.markdown-body a img').getAttribute('tabindex'),null);
  for(let i=0;i<6;i++){await page.locator('.markdown-body img[data-preview-image]').first().evaluate(el=>el.click());await page.waitForTimeout(25);await page.keyboard.press('Escape');await page.waitForTimeout(25);}
  await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await page.locator('[data-slot="dialog-overlay"]').count(),0);
  await page.locator('.article-neighbors a[href="/article/2"]').click();await page.waitForURL(origin+'/article/2');await openImage(page);await page.goBack();await page.waitForURL(origin+'/article/1');await page.getByRole('dialog').waitFor({state:'hidden'});
 });
 await run('filter indicator follows latest state and selected type resets pagination',async({page})=>{
  await page.goto(origin+'/updates?page=2');const nav=page.getByRole('navigation',{name:'更新类型'});await nav.getByRole('button',{name:'全部',exact:true}).click();await page.waitForURL(origin+'/updates?type=&page=1');
  for(const label of ['文章','近况','项目版本','全部','近况']){await nav.getByRole('button',{name:label,exact:true}).evaluate(el=>el.click());await page.waitForTimeout(35);}
  await page.waitForTimeout(450);assert.equal(new URL(page.url()).searchParams.get('type'),'update');await page.getByText('当前类型 update',{exact:true}).waitFor();
  const geometry=await nav.evaluate(nav=>{const line=nav.querySelector('.filter-tab-indicator').getBoundingClientRect(),active=nav.querySelector('[aria-pressed=true]').getBoundingClientRect();return{line:line.x,width:line.width,active:active.x,target:active.width,animations:nav.querySelector('.filter-tab-indicator').getAnimations().length};});assert.ok(Math.abs(geometry.line-geometry.active)<.5);assert.ok(Math.abs(geometry.width-geometry.target)<.5);assert.equal(geometry.animations,0);
 });
 await run('search Escape restores trigger; mobile menu rapid open/close retains existing protection',async({page})=>{
  await article(page);const search=page.getByRole('button',{name:'搜索文章',exact:true});await search.click();await page.locator('#header-query').fill('保留搜索词');await page.keyboard.press('Escape');assert.equal(await search.evaluate(el=>el===document.activeElement),true);await search.click();assert.equal(await page.locator('#header-query').inputValue(),'保留搜索词');await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});for(let i=0;i<5;i++){await page.getByRole('button',{name:'打开菜单',exact:true}).evaluate(el=>el.click());await page.waitForTimeout(20);await page.keyboard.press('Escape');}
  assert.equal(await page.locator('.m-panel').count(),0);assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('menu-open')),false);assert.equal(await page.getByRole('button',{name:'打开菜单',exact:true}).evaluate(el=>el===document.activeElement),true);
 });
 await run('bookmark slow failure retries original mutation, comment input survives and likes lock',async({page,state})=>{
  state.releaseImages();await article(page);await page.getByRole('button',{name:'收藏',exact:true}).waitFor();state.bookmarkFail=true;const writes=()=>state.requests.filter(r=>r.key==='/bookmarks/1'&&r.method!=='GET');
  await page.getByRole('button',{name:'收藏',exact:true}).evaluate(el=>{el.click();el.click();el.click();});await page.getByRole('button',{name:'正在保存…',exact:true}).waitFor();await page.getByRole('status').filter({hasText:'尚未确认操作结果'}).getByRole('button',{name:'重试',exact:true}).waitFor();assert.equal(writes().length,1);
  state.bookmarkFail=false;await page.getByRole('status').filter({hasText:'尚未确认操作结果'}).getByRole('button',{name:'重试',exact:true}).click();await page.getByRole('button',{name:'已收藏',exact:true}).waitFor();assert.deepEqual(writes().map(r=>r.method),['PUT','PUT']);
  const input=page.getByRole('textbox',{name:'写下你的评论',exact:true});await input.fill('发送这条');await page.getByRole('button',{name:'发表评论',exact:true}).click();await input.fill('等待中写的新内容');await page.getByRole('button',{name:'发表评论',exact:true}).waitFor();assert.equal(await input.inputValue(),'等待中写的新内容');
  state.commentFail=true;await page.getByRole('button',{name:'发表评论',exact:true}).click();await page.getByText('本地模拟提交失败，请重试',{exact:true}).first().waitFor();assert.equal(await input.inputValue(),'等待中写的新内容');state.commentFail=false;await page.getByRole('button',{name:'发表评论',exact:true}).click();await page.getByRole('button',{name:'发表评论',exact:true}).waitFor();assert.equal(await input.inputValue(),'');
  const like=page.locator('.comment-like').first();await like.evaluate(el=>{el.click();el.click();el.click();});assert.equal(await like.getAttribute('aria-busy'),'true');await page.waitForFunction(()=>document.querySelector('.comment-like')?.getAttribute('aria-busy')==='false');assert.equal(state.requests.filter(r=>r.key==='/comments/1/like'&&r.method==='POST').length,1);assert.equal(await like.getAttribute('aria-pressed'),'true');
 });
 await run('common dialog rapid reopen, keyboard, scroll lock and focus restore',async({page})=>{
  await page.goto(origin+'/account/bookmarks');const trigger=page.getByRole('button',{name:'新建收藏夹',exact:true});await trigger.waitFor();
  for(let i=0;i<4;i++){await trigger.evaluate(el=>el.click());await page.waitForTimeout(30);await page.keyboard.press('Escape');await page.waitForTimeout(30);}await page.getByRole('dialog').waitFor({state:'hidden'});await trigger.click();const dialog=page.getByRole('dialog',{name:'新建收藏夹'});await dialog.waitFor();
  for(let i=0;i<7;i++){await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>!!document.activeElement.closest('[role=dialog]')));}
  await page.getByRole('button',{name:'取消',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);assert.equal(await page.locator('[data-slot=dialog-overlay]').count(),0);
 });
 await run('shared button press and Radix menu rapid reopen, keyboard and outside close',async({page})=>{
  await page.goto(origin+'/admin/posts');const trigger=page.locator('button[aria-label="更多操作：本地菜单验收"]');await trigger.waitFor();
  const action=page.getByRole('button',{name:'从旧站导入',exact:true}),box=await action.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(140);assert.ok(Number(await action.evaluate(el=>getComputedStyle(el).scale))<1);await page.mouse.move(0,0);await page.mouse.up();
  for(let i=0;i<5;i++){await trigger.dispatchEvent('pointerdown',{button:0,ctrlKey:false,pointerType:'mouse'});await page.waitForTimeout(25);await page.keyboard.press('Escape');await page.waitForTimeout(25);}await page.getByRole('menu').waitFor({state:'hidden'});assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
  await trigger.click();await page.getByRole('menu').waitFor();await page.keyboard.press('ArrowDown');assert.equal(await page.getByRole('menuitem',{name:'编辑',exact:true}).evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Escape');await page.getByRole('menu').waitFor({state:'hidden'});
  const outside=await page.getByRole('heading',{name:'文章管理',exact:true}).boundingBox();await trigger.click();await page.mouse.click(outside.x+outside.width/2,outside.y+outside.height/2);await page.getByRole('menu').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>document.body.style.pointerEvents),'');
 });
 await run('mobile swipe, cancelled/multitouch gestures and short viewport controls',async({page,state,context})=>{
  state.releaseImages();state.broken=false;await article(page);await openImage(page);const stage=slide(page),box=await stage.boundingBox(),cdp=await context.newCDPSession(page),y=box.y+Math.min(80,box.height/2),x=box.x+box.width*.8;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-110,y:y+4,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await counter(page,'2 / 3');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1},{x:x-40,y:y+30,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await counter(page,'2 / 3');
  await page.setViewportSize({width:390,height:320});await page.waitForTimeout(100);const layout=await page.getByRole('dialog').evaluate(el=>{const r=el.getBoundingClientRect();return{top:r.top,bottom:r.bottom,buttons:[...el.querySelectorAll('button')].map(b=>({top:b.getBoundingClientRect().top,bottom:b.getBoundingClientRect().bottom})),overflow:document.documentElement.scrollWidth>innerWidth};});assert.ok(layout.top>=0&&layout.bottom<=320);assert.ok(layout.buttons.every(b=>b.top>=0&&b.bottom<=320));assert.equal(layout.overflow,false);await cdp.detach();
 },{mobile:true,dark:true,viewport:{width:390,height:844}});
 for(const mode of ['system','site','unavailable'])await run('motion '+mode+' preserves complete functionality',async({page,state})=>{
  state.releaseImages();state.broken=false;await article(page);await openImage(page);await page.keyboard.press('ArrowRight');await counter(page,'2 / 3');await page.waitForFunction(()=>document.querySelector('.article-image-stage')?.getAttribute('aria-busy')==='false');assert.equal(await page.locator('.article-image-stage img').evaluate(el=>el.getAnimations().length),0);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await page.locator('[data-slot=dialog-overlay]').count(),0);
 },{reduced:mode==='system',localReduced:mode==='site',noWAAPI:mode==='unavailable'});
 assert.deepEqual(report.errors,[]);assert.equal(report.productionRequests,0);report.passed=report.cases.every(row=>row.passed);
}catch(error){report.error=error.stack;report.passed=false;console.error(error);process.exitCode=1;}finally{await browser?.close();await server?.httpServer.close();fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,cases:report.cases.map(({name,passed})=>({name,passed})),errors:report.errors,videos:report.videos.length}));}})();

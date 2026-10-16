// Real built routes; every API response and mutation is isolated to this browser context.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright');
const origin=process.env.INTERACTION_ORIGIN||'http://127.0.0.1:5235',baseline=process.env.ROUND2_BASELINE==='1',engine=process.env.ROUND2_ENGINE||'chrome';
assert.match(origin,/^http:\/\/127\.0\.0\.1:\d+$/);
const output=path.resolve(process.env.INTERACTION_EVIDENCE||`.cache/interaction-round2/public/${baseline?'before':'after'}-${engine}`);fs.mkdirSync(output,{recursive:true});
const dark=process.env.ROUND2_DARK==='1';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),report={origin,baseline,engine,cases:[],videos:[],pageerrors:[],externalRequests:[],mutations:[]};
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1400"><rect width="2000" height="1400" fill="seagreen"/><text x="70" y="250" fill="white" font-size="80">Isolated reading fixture</text></svg>';
const content='## 第一部分\n\n'+Array.from({length:9},()=> '真实组件中的本地文章，检查滚动和返回，不连接生产服务。').join('\n\n')+'\n\n![可拖动图片](/round2-images/one.svg)\n\n## 第二部分\n\n![慢加载图片](/round2-images/two.svg)\n\n![失败图片](/round2-images/three.svg)\n\n## 第三部分\n\n'+('保留阅读位置。\n\n'.repeat(15));
const post=id=>({id,title:'本地文章 '+id,summary:'一致数据与视口，检验返回和局部更新。',content,category:'技术手记',tags:['React'],author_name:'本地读者',created_at:'2026-10-16T01:00:00Z',published_at:'2026-10-16T01:00:00Z'});
async function install(context){
 const state={requests:[],slow:false,fail:false,broken:true};
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==origin){if(url.hostname==='status.mooncci.site'&&url.pathname==='/badge')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Local status fixture</title><span>本地状态</span>'});report.externalRequests.push({url:req.url(),method:req.method(),blocked:true});return route.abort();}
  if(url.pathname.startsWith('/round2-images/')){if(url.pathname.includes('two')&&state.slow)await pause(1000);const failed=url.pathname.includes('three')&&state.broken;return route.fulfill({status:failed?503:200,contentType:'image/svg+xml',body:failed?'Injected image decode failure':svg});}
  if(!url.pathname.startsWith('/api/'))return route.continue();
  const key=url.pathname.slice(4),method=req.method();state.requests.push({key,query:url.search,method});
  const json=data=>route.fulfill({json:data});
  if(method!=='GET'){report.mutations.push({key,method,mocked:true});return json({ok:true});}
  if(key==='/auth/session')return json({user:{id:9000,username:'本地验收',email:'reader@example.invalid',role:'owner'}});
  if(key==='/settings/site')return json({brand:{name:'mooncci'},hero:{title:'Explore the Programming',subtitle:'真实业务组件交互验收',primary_text:'阅读文章',primary_link:'/articles',secondary_text:'浏览分类',secondary_link:'/categories'},footer:{}});
  if(key==='/engagement/config')return json({enabled:true});if(key==='/publishing/config')return json({enabled:false});if(key==='/engagement/preferences')return json({history_enabled:false});
  if(key==='/subscriptions/status')return json({available:false});if(key==='/now')return json({content:'最近近况使用原有样式和数据接口。',updated_at:'2026-10-16'});
  if(key==='/posts/meta/categories')return json([{category:'技术手记',total:25}]);if(key==='/posts/meta/tags')return json([{tag:'React',total:25}]);
  if(key==='/posts'){
   const page=Number(url.searchParams.get('page')||1),search=url.searchParams.get('search')||'';
   if(state.slow)await pause(search==='old'?900:search==='new'?150:650);
   if(state.fail)return route.fulfill({status:503,json:{message:'本地模拟列表失败'}});
   const items=search==='empty'?[]:Array.from({length:12},(_,i)=>({...post((page-1)*12+i+1),title:search?search+' '+i:post((page-1)*12+i+1).title}));
   return json(url.searchParams.get('format')==='paged'?{items,total:search==='empty'?0:25,page,pageSize:12}:items.slice(0,4));
  }
  if(/^\/posts\/\d+$/.test(key))return json(post(Number(key.split('/').at(-1))));
  if(key.endsWith('/discovery'))return json({related:[],next:{id:2,title:'本地文章 2'},previous:{id:1,title:'本地文章 1'}});
  if(key.startsWith('/series/article/'))return json(null);if(key.startsWith('/comments/'))return json([]);if(key==='/bookmark-folders')return json({items:[]});if(key.startsWith('/bookmarks/'))return json({bookmarked:false});
  if(key==='/activity'){
   const type=url.searchParams.get('type')||'all';if(state.slow)await pause(type==='post'?900:180);
   return json({items:[{activity_id:type==='all'||type==='update'?'update-1':type+'-1',id:1,type:type==='all'?'update':type,path:type==='update'||type==='all'?'/updates/1':'/article/1',title:'更新 '+type,excerpt:'当前类型 '+type,published_at:'2026-10-16'}],total:1,page:1,pageSize:10});
  }
  if(key==='/updates/1')return json({id:1,title:'本地近况',content:'隔离近况正文',published_at:'2026-10-16'});
  if(key==='/projects')return json({items:[{id:1,slug:'fixture',name:'本地作品',stage:'active',summary:'原生展开与返回'}],total:1,page:1,pageSize:10});
  if(key==='/projects/fixture')return json({id:1,slug:'fixture',name:'本地作品',stage:'active',summary:'隔离作品详情',content:'## 项目说明\n\n保留已有控件。',releases:{items:[{id:1,title:'隔离版本 1.0',content:'版本展开沿用原生 details。',published_at:'2026-10-16'}],total:1,page:1,pageSize:10}});
  if(key.startsWith('/analytics/'))return json({views:1});if(key.startsWith('/weather-mood'))return json({disabled:true});return json({});
 });return state;
}
async function flow(page,state,row){
 const check=(name,passed,details)=>{row.checks.push({name,passed,details});if(!baseline)assert.equal(passed,true,name);};
 // Independent recording scenarios start after the previous document's passive effects.
 // There is no wait inside rapid switching, pending requests, modal reversal or input tests.
 const scenario=async route=>{if(page.url().startsWith(origin))await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.goto(origin+route);};
 await scenario('/');await page.getByRole('link',{name:'阅读文章 ↗',exact:true}).click();await page.locator('.blog-card').first().waitFor();
 await page.getByRole('link',{name:'下一页',exact:true}).click();await page.waitForURL(/page=2/);await page.getByRole('heading',{name:'本地文章 13',exact:true}).waitFor();await page.locator('.blog-card').nth(4).scrollIntoViewIfNeeded();
 const scroll=await page.evaluate(()=>scrollY);await page.locator('.blog-card').nth(4).click();await page.waitForURL(/\/article\/17$/);await page.locator('.markdown-body').waitFor();
 await page.getByRole('link',{name:'← 返回',exact:true}).click();await page.waitForURL(/\/articles\?page=2$/);await page.waitForTimeout(300);
 check('list-detail-back restores query and scroll',Math.abs(await page.evaluate(()=>scrollY)-scroll)<2,{before:scroll,after:await page.evaluate(()=>scrollY)});
 await page.getByRole('link',{name:'按分类浏览 ↗',exact:true}).click();await page.locator('.project-card[href^="/category/"]').click();await page.locator('.blog-card').first().waitFor();const categoryUrl=page.url();await page.locator('.blog-card').first().click();await page.locator('.markdown-body').waitFor();await page.goBack();await page.waitForURL(categoryUrl);check('category-detail-browser-back preserves original category',page.url()===categoryUrl);
 await scenario('/search?q=start');await page.locator('.blog-card').first().waitFor();state.slow=true;
 await page.getByRole('link',{name:'下一页',exact:true}).click();await page.waitForTimeout(90);check('pending pagination can immediately reverse',await page.getByRole('link',{name:'上一页',exact:true}).count()===1);
 await page.getByRole('link',{name:'下一页',exact:true}).click();await page.waitForTimeout(90);check('repeated next follows requested page rather than retained rows',new URL(page.url()).searchParams.get('page')==='3');
 await scenario('/search?q=start');await page.locator('.blog-card').first().waitFor();
 const input=page.locator('#article-search'),form=page.locator('form').filter({has:input});const previous=state.requests.filter(r=>r.key==='/posts').length;
 await input.dispatchEvent('compositionstart');await input.fill('候选');await input.dispatchEvent('keydown',{key:'Enter',code:'Enter',keyCode:229,isComposing:true});await form.dispatchEvent('submit');await page.waitForTimeout(100);
 check('IME candidate confirmation does not submit',state.requests.filter(r=>r.key==='/posts').length===previous);
 await input.dispatchEvent('compositionend',{data:'候选'});await input.fill('old');await input.press('Enter');await page.waitForTimeout(90);
 check('slow refresh retains current list',await page.locator('.blog-card').count()===12,{skeletons:await page.locator('.content-skeleton').count()});
 await input.fill('new');await input.press('Enter');await page.waitForTimeout(1150);check('latest search response wins',(await page.locator('.blog-card h3').first().innerText()).startsWith('new'));
 state.fail=true;await input.fill('failure');await input.press('Enter');await page.waitForTimeout(800);check('failure keeps old content and retry',await page.getByText('暂时无法更新',{exact:true}).count()===1&&await page.locator('.blog-card').count()===12);
 state.fail=false;await page.getByRole('button',{name:/^(重新加载|重试)$/}).click();await page.waitForTimeout(800);
 await input.fill('empty');await input.press('Enter');await page.waitForTimeout(800);await page.getByText('没有符合当前条件的文章。',{exact:true}).waitFor();
 await scenario('/updates');await page.getByText('当前类型 all',{exact:true}).waitFor();const nav=page.getByRole('navigation',{name:'更新类型'});
 await nav.getByRole('button',{name:'文章',exact:true}).click();await page.waitForTimeout(70);await nav.getByRole('button',{name:'近况',exact:true}).click();await page.waitForTimeout(1150);check('update content follows latest indicator',await page.getByText('当前类型 update',{exact:true}).count()===1);
 const updateUrl=page.url();await page.getByRole('link',{name:'查看近况',exact:true}).click();await page.getByRole('heading',{name:'本地近况',exact:true}).waitFor();await page.goBack();await page.waitForURL(updateUrl);check('update detail returns to the selected feed',page.url()===updateUrl);
 await scenario('/projects');await page.locator('.project-card').first().click();await page.getByRole('heading',{name:'本地作品',exact:true}).waitFor();const release=page.locator('details.release-record');await release.locator('summary').click();check('native project release expansion remains keyboard usable',await release.getAttribute('open')!==null);await release.locator('summary').focus();await page.keyboard.press('Enter');check('native release collapse remains immediate',await release.getAttribute('open')===null);await page.goBack();await page.waitForURL(origin+'/projects');
 await scenario('/article/1');const image=page.locator('img[data-preview-image]').first();await image.scrollIntoViewIfNeeded();await page.waitForTimeout(150);const reading=await page.evaluate(()=>scrollY),originBox=await image.boundingBox();await image.click();await page.locator('.article-image-stage[aria-busy=false]').waitFor();
 await page.getByRole('button',{name:'关闭弹窗',exact:true}).click();await page.mouse.click(originBox.x+originBox.width/2,originBox.y+originBox.height/2);await page.waitForTimeout(60);
 const reopened=await page.locator('[role=dialog][data-state=open]').count()===1;check('native immediate reopen is not swallowed by a closed overlay',reopened);
 if(!reopened){await page.getByRole('dialog').waitFor({state:'hidden'});await image.click();}await page.locator('.article-image-stage[aria-busy=false]').waitFor();
 await page.getByRole('button',{name:'查看原始尺寸',exact:true}).click();const stage=page.locator('.article-image-stage'),direct=await stage.getAttribute('data-scale')!==null;
 if(direct)await page.waitForTimeout(300);else await stage.evaluate(el=>{el.scrollLeft=400;el.scrollTop=350;});const beforePan=await stage.evaluate(el=>({x:Number(el.dataset.panX||0),y:Number(el.dataset.panY||0)})),box=await stage.boundingBox();
 await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.5-90,box.y+box.height*.5-70,{steps:5});await page.mouse.up();
 const pan=await stage.evaluate(el=>el.dataset.scale?{x:Number(el.dataset.panX),y:Number(el.dataset.panY)}:{x:el.scrollLeft,y:el.scrollTop});check('zoomed pointer drag follows the pointer once',direct?Math.abs(pan.x-beforePan.x+90)<2&&Math.abs(pan.y-beforePan.y+70)<2:pan.x>=480&&pan.y>=410,pan);
 await stage.focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(200);check('zoomed arrow keys pan without changing image',(await page.locator('.article-image-navigation [role=status]').innerText())==='1 / 3');
 await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});await image.click();await page.locator('.article-image-stage[aria-busy=false]').waitFor();await page.keyboard.press('ArrowRight');await page.waitForTimeout(50);await page.keyboard.press('ArrowRight');await page.getByText('图片加载失败',{exact:true}).waitFor();state.broken=false;await page.getByRole('button',{name:'重试',exact:true}).click();await page.locator('.article-image-stage[aria-busy=false]').waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
 check('image close preserves reading position',Math.abs(await page.evaluate(()=>scrollY)-reading)<2);check('no residual scroll lock',await page.evaluate(()=>document.body.style.pointerEvents!== 'none'&&getComputedStyle(document.body).overflow!=='hidden'));
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:/^目录/}).click();await page.locator('#article-narrow-directory a').nth(1).click();await page.waitForTimeout(650);
 check('directory closes and focuses the actual heading',await page.locator('#article-narrow-directory').getAttribute('hidden')!==null&&await page.evaluate(()=>/^H[1-6]$/.test(document.activeElement?.tagName||'')));
 check('mobile layout has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
}
module.exports={install,flow};
if(require.main===module)(async()=>{const browser=await(engine==='webkit'?webkit.launch({headless:true}):chromium.launch({channel:'chrome',headless:true}));try{
 for(const options of (dark?[{width:1440,reduced:false},{width:390,reduced:false}]:[{width:1440,reduced:false},{width:390,reduced:false},{width:390,reduced:true}])){
  const context=await browser.newContext({viewport:{width:options.width,height:options.width===390?844:900},hasTouch:options.width===390,colorScheme:dark?'dark':'light',reducedMotion:options.reduced?'reduce':'no-preference',recordVideo:{dir:output,size:{width:options.width,height:options.width===390?844:900}}});
  await context.addInitScript(dark=>{try{localStorage.setItem('mooncci-theme',dark?'dark':'light');}catch{/* Sandboxed embedded frames have no storage. */}},dark);
  const state=await install(context),page=await context.newPage(),row={...options,checks:[]};report.cases.push(row);page.on('pageerror',e=>report.pageerrors.push(e.message));
  try{await flow(page,state,row);row.passed=true;}catch(error){row.error=error.stack;row.dom=await page.locator('body').innerText();await page.screenshot({path:path.join(output,'failure.png')});throw error;}finally{const video=page.video();await context.close();const name=`public-${options.width}-${options.reduced?'reduced':'normal'}.webm`;await video.saveAs(path.join(output,name));report.videos.push(name);fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));}
 }
 assert.deepEqual(report.pageerrors,[]);report.recordingComplete=true;report.passed=report.cases.every(row=>row.checks.every(check=>check.passed));report.expectedBaselineFailures=baseline?report.cases.flatMap(row=>row.checks.filter(check=>!check.passed).map(check=>({width:row.width,reduced:row.reduced,...check}))):[];
}catch(error){report.passed=false;report.error=error.stack;process.exitCode=1;console.error(error);}finally{await browser.close();fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,origin,cases:report.cases}));}})();

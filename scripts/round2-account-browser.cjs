// Real account pages with loopback-only in-memory API adapters; no production requests or mail.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium,webkit}=require('playwright');
const origin=process.env.INTERACTION_ORIGIN||'http://127.0.0.1:5235',baseline=process.env.ACCOUNT_BASELINE==='1',engine=process.env.ACCOUNT_ENGINE||'chromium';
assert.match(origin,/^http:\/\/127\.0\.0\.1:\d+$/);
const output=path.resolve(process.env.INTERACTION_EVIDENCE||'.cache/interaction-round2/account/'+(baseline?'before':'after')+'-'+engine);fs.mkdirSync(output,{recursive:true});
const report={origin,baseline,engine,cases:[],pageerrors:[],mutations:[],blockedRequests:[],videos:[]};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function setup(browser,{width,reduced}){
 const context=await browser.newContext({viewport:{width,height:width===390?844:900},isMobile:width===390,hasTouch:width===390,reducedMotion:reduced?'reduce':'no-preference',recordVideo:{dir:path.join(output,'raw'),size:{width,height:width===390?844:900}}});
 const state={removed:false,removeFailed:false,historyRemoved:false,historyFailed:false,notificationSlow:false,unread:1,sessionFailed:false,sessionsRemoved:false,composition:[],reads:[]};
 await context.addInitScript(()=>{try{localStorage.setItem('mooncci-theme','light');}catch{}});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url()),method=req.method();if(url.origin!==origin){report.blockedRequests.push({url:req.url(),method});return route.abort('blockedbyclient');}
  if(!url.pathname.startsWith('/api/'))return route.continue();
  const key=url.pathname.slice(4),json=(value,status=200)=>route.fulfill({status,json:value}).catch(()=>{}),user={id:9000,username:'本地验收',email:'local@example.test',role:'owner'};
  if(!['GET','HEAD'].includes(method)){
   report.mutations.push({key,method,body:req.postData()});await wait(800);
   if(/^\/bookmarks\/\d+$/.test(key)){if(state.removeFailed)return json({message:'本地模拟取消失败'},400);state.removed=true;return json({bookmarked:false});}
   if(/^\/engagement\/history\//.test(key)){if(state.historyFailed)return json({message:'本地模拟删除失败'},400);state.historyRemoved=true;return json({ok:true});}
   if(key==='/engagement/notifications/read'){state.unread=0;return json({ok:true});}if(key==='/account/sessions/other'){if(state.sessionFailed)return json({message:'本地模拟退出失败'},400);state.sessionsRemoved=true;return json({ok:true});}
   return json({message:'未允许的本地写操作'},400);
  }
  state.reads.push({key,search:url.search});
  if(key==='/auth/session')return json({user});if(key==='/settings/site')return json({brand:{name:'mooncci'},hero:{},footer:{}});
  if(key==='/engagement/config')return json({enabled:true});if(key==='/publishing/config'||key==='/operations/config')return json({enabled:false});
  if(key==='/engagement/preferences')return json({history_enabled:true,email_verified:true,comment_email:false,reply_email:false});if(key==='/engagement/notifications/unread')return json({unread:state.unread});
  if(key==='/account')return json({user:{...user,version:1,can_comment:1,status:'active'}});if(key==='/auth/connections')return json({providers:[]});if(key==='/account/sessions')return json({items:[{id:'current',browser:'Chrome',os:'Windows',current:true,first_seen:1792116000000,last_seen:1792116000000,expires_at:1792716000000},...(!state.sessionsRemoved?[{id:'other',browser:'Firefox',os:'Linux',current:false,first_seen:1792116000000,last_seen:1792116000000,expires_at:1792716000000}]:[])]});
  if(key==='/bookmark-folders')return json({items:[{id:0,name:'默认收藏夹',total:0},{id:1,name:'学习',total:2}]});
  if(key==='/bookmarks'){
   state.composition.push(url.searchParams.get('search')||'');
   if(state.removed)await wait(600);const items=[{id:1,post_id:1,title:'第一篇收藏文章',summary:'等待期间保留内容，操作结果基于真实接口回执。',category:'技术手记',tags:[],available:true,folder_id:1},{id:2,post_id:2,title:'第二篇收藏文章',summary:'取消失败时仍可重试，不丢失列表上下文。',tags:[],available:true,folder_id:1}].filter(item=>!state.removed||item.id!==1);
   return json({items,total:items.length,page:1,pageSize:12});
  }
  if(key==='/engagement/notifications'){
   const kind=url.searchParams.get('kind')||'all';if(state.notificationSlow)await wait(kind==='reply'?900:80);
   return json({items:[{id:1,title:'通知 '+kind,message:'切换后的内容应跟随最新分类。',is_read:state.unread===0,available:true,url:'/article/1',created_at:'2026-10-16T10:00:00Z'}],unread:state.unread,total:1,page:1,pageSize:20});
  }
  if(/^\/posts\/\d+$/.test(key))return json({id:Number(key.split('/')[2]),title:'返回上下文测试文章',content:'## 阅读正文\n\n'+Array.from({length:24},(_,i)=>'正文段落 '+i+'：只用于本机验证返回与滚动位置。').join('\n\n'),summary:'本地只读内容',tags:[],published_at:'2026-10-16T10:00:00Z'});if(key.endsWith('/discovery'))return json({related:[],previous:null,next:null});if(key.startsWith('/series/article/'))return json(null);if(key.startsWith('/comments/post/'))return json([]);if(/^\/bookmarks\/\d+$/.test(key))return json({bookmarked:true});if(/^\/engagement\/history\/\d+$/.test(key))return json({enabled:false,epoch:0,item:null});
  if(key==='/engagement/history')return json({items:state.historyRemoved?[]:[{post_id:1,title:'继续阅读测试文章',progress:.45,updated_at:1792116000000}],total:state.historyRemoved?0:1,page:1,pageSize:30});
  if(key.startsWith('/weather-mood'))return json({disabled:true});return json({});
 });
 const page=await context.newPage();page.on('pageerror',error=>report.pageerrors.push({width,reduced,text:error.message}));return {context,page,state};
}
(async()=>{let browser;try{browser=await (engine==='webkit'?webkit.launch({headless:true}):chromium.launch({channel:'chrome',headless:true}));
 for(const options of [{width:1440,reduced:false},{width:390,reduced:false},{width:390,reduced:true}].filter(item=>!process.env.ACCOUNT_WIDTH||item.width===Number(process.env.ACCOUNT_WIDTH))){
  const f=await setup(browser,options),{page,state,context}=f,row={...options,checks:[]};report.cases.push(row);
  try{
   await page.goto(origin+'/account/bookmarks?folder=1');await page.locator('.bookmark-item').first().waitFor();await page.waitForTimeout(200);
   const remove=page.getByRole('button',{name:'取消收藏：第一篇收藏文章',exact:true});await remove.evaluate(el=>{el.click();el.click();});await page.waitForTimeout(180);row.pendingRows=await page.locator('.bookmark-item').count();row.pendingSkeletons=await page.locator('.content-skeleton').count();
   if(!baseline)assert.equal(row.pendingRows,2,'Slow removal must preserve the real list');await page.waitForTimeout(780);row.afterAckRows=await page.locator('.bookmark-item').count();if(!baseline)assert.equal(row.afterAckRows,1,'Acknowledged removal must not unmount the remaining list during refresh');await page.waitForTimeout(700);row.removeWrites=report.mutations.filter(r=>r.key==='/bookmarks/1').length-(report.cases.slice(0,-1).reduce((n,item)=>n+(item.removeWrites||0),0));if(!baseline)assert.equal(row.removeWrites,1,'One mutation per case despite duplicate click');assert.equal(await page.locator('.bookmark-item').count(),1);row.checks.push('bookmark removal pending, acknowledgement and refresh');
   const search=page.getByPlaceholder('搜索文章标题'),count=state.composition.length;await search.dispatchEvent('compositionstart');await search.fill('zhong');await page.waitForTimeout(420);row.imeRequests=state.composition.length-count;if(!baseline)assert.equal(row.imeRequests,0);
   await search.fill('中文');await search.dispatchEvent('compositionend',{data:'中文'});await page.waitForTimeout(450);row.imeFinalQuery=state.composition.at(-1);assert.equal(row.imeFinalQuery,'中文');if(!baseline)assert.equal(new URL(page.url()).searchParams.get('search'),'中文');row.checks.push('IME confirmation and existing debounced trigger');
   await page.locator('.bookmark-item a').first().scrollIntoViewIfNeeded();await page.waitForTimeout(120);const beforeBack={url:page.url(),scroll:await page.evaluate(()=>scrollY),timeOrigin:await page.evaluate(()=>performance.timeOrigin)};
   await page.evaluate(()=>{window.__accountClick=[];window.addEventListener('click',event=>{window.__accountClick.push({target:event.target.tagName,text:event.target.textContent?.slice(0,100),href:event.target.closest('a')?.href,defaultPrevented:event.defaultPrevented});});});await page.locator('.bookmark-item a').first().click();row.navigationClickObservation={url:page.url(),events:await page.evaluate(()=>window.__accountClick)};await page.getByRole('heading',{name:'返回上下文测试文章',exact:true}).waitFor();await page.goBack();await page.locator('.bookmark-item').first().waitFor();await page.waitForTimeout(250);
   row.returnContext={url:page.url(),input:await page.getByPlaceholder('搜索文章标题').inputValue(),scroll:await page.evaluate(()=>scrollY),timeOrigin:await page.evaluate(()=>performance.timeOrigin),expected:beforeBack};
   assert.equal(row.returnContext.url,beforeBack.url);assert.equal(row.returnContext.timeOrigin,beforeBack.timeOrigin);if(!baseline){assert.equal(row.returnContext.input,'中文');assert.ok(Math.abs(row.returnContext.scroll-beforeBack.scroll)<=1);}row.checks.push('real bookmark article navigation and browser-back context');
   await page.goto(origin+'/account/notifications');await page.getByRole('heading',{name:'通知 all',exact:true}).waitFor();state.notificationSlow=true;
   await page.getByRole('radio',{name:'评论回复',exact:true}).click();await page.waitForTimeout(80);await page.getByRole('radio',{name:'审核通过',exact:true}).click();await page.waitForTimeout(1150);
   row.finalNotification=await page.locator('.notification-row h2').textContent();if(!baseline)assert.equal(row.finalNotification,'通知 approved');row.checks.push('rapid notification category switch with delayed old response');
   await page.getByRole('button',{name:'全部已读',exact:true}).click();await page.waitForTimeout(1100);row.sidebarUnreadAfterAcknowledgement=await page.locator('.account-sidebar [aria-label="1 条未读"]').count();if(!baseline)assert.equal(row.sidebarUnreadAfterAcknowledgement,0);row.checks.push('acknowledged read updates sidebar count without waiting for the polling interval');
   await page.goto(origin+'/account/history');await page.getByRole('heading',{name:'继续阅读测试文章',exact:true}).waitFor();state.historyFailed=true;
   await page.getByRole('button',{name:'删除',exact:true}).click();await page.waitForTimeout(1000);assert.equal(await page.getByRole('heading',{name:'继续阅读测试文章',exact:true}).count(),1);await page.locator('.engagement-alert').filter({hasText:'本地模拟删除失败'}).waitFor();row.checks.push('failed removal retains actual reading context');
   state.historyFailed=false;await page.getByRole('button',{name:'删除',exact:true}).click();await page.waitForTimeout(1000);await page.getByRole('heading',{name:'从下一篇文章开始',exact:true}).waitFor();
   await page.goto(origin+'/account/sessions');await page.getByRole('button',{name:'退出 Firefox Linux',exact:true}).waitFor();state.sessionFailed=true;await page.getByRole('button',{name:'退出 Firefox Linux',exact:true}).click();await page.getByRole('button',{name:'确认退出',exact:true}).evaluate(el=>{el.click();el.click();});await page.waitForTimeout(1000);await page.getByRole('dialog').getByText('本地模拟退出失败',{exact:true}).waitFor();assert.equal(await page.locator('.session-row').filter({hasText:'Firefox'}).count(),1);state.sessionFailed=false;await page.getByRole('button',{name:'确认退出',exact:true}).click();await page.waitForTimeout(1000);await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await page.getByRole('button',{name:'退出 Firefox Linux',exact:true}).count(),0);row.checks.push('session confirmation, failure retention and acknowledged retry via mock only');
   await page.goto(origin+'/account/settings');await page.getByRole('heading',{name:'个人资料',exact:true}).waitFor();assert.equal(await page.getByLabel('新邮箱',{exact:true}).count(),1);row.checks.push('retained real settings forms render and keep their existing appearance');
   row.overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(row.overflow,false);row.recorded=true;row.passed=!baseline;
  }catch(error){row.error=error.stack;row.failureUrl=page.url();row.failureDom=await page.locator('body').innerText();row.failureReads=state.reads;report.error=error.stack;await page.screenshot({path:path.join(output,'diagnostic-failure.png')});throw error;}finally{const video=page.video();await context.close();const filename=`account-${options.width}-${options.reduced?'reduced':'normal'}.webm`;await video.saveAs(path.join(output,filename));report.videos.push(filename);}
 }
 assert.deepEqual(report.pageerrors,[]);report.recorded=true;report.passed=!baseline;
}catch(error){report.passed=false;process.exitCode=1;console.error(error);}finally{await browser?.close();fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,origin,cases:report.cases,error:report.error}));}})();

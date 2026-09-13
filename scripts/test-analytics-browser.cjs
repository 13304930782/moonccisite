const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const {preview}=await import('vite');const server=await preview({preview:{host:'127.0.0.1',port:4199,strictPort:true}});let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
  const page=await browser.newPage();await page.addInitScript(()=>Object.defineProperty(navigator,'doNotTrack',{value:'0',configurable:true}));const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let role='owner',fail=false,tracked=[];
  await page.route('**/api/**',async route=>{
   const url=new URL(route.request().url());let data={};
   if(url.pathname==='/api/auth/me')data={user:{id:1,username:'tester',email:'test@example.test',role,status:'active'}};
   else if(url.pathname==='/api/admin/analytics'){
    if(fail)return route.fulfill({status:503,json:{message:'统计暂时不可用'}});
    const days=Number(url.searchParams.get('days'));data={days,start:'2026-09-01',end:'2026-09-07',startedAt:'2026-09-01T00:00:00Z',summary:{views:420,visitors:100,totalViews:500,activeMembers:10},users:{active:20,disabled:2,deleted:1},trend:Array.from({length:days},(_,i)=>({day:'2026-09-'+String(i+1).padStart(2,'0'),views:i*10,visitors:i*2,registrations:i%2})),popular:[{path:'/article/123',views:42},{path:'/projects/'+ 'long'.repeat(30),views:20}],sources:[{label:'example.test',views:50}],devices:[{label:'mobile',views:40}],roles:[{label:'user',count:20}],identities:[{label:'microsoft',count:2}]};
   }else if(url.pathname==='/api/posts/123')data={id:123,title:'阅读量测试',content:'测试正文',author_name:'作者',published_at:'2026-09-01T00:00:00Z'};
   else if(url.pathname==='/api/analytics/article/123')data={views:1234};
   else if(url.pathname==='/api/analytics/view'){tracked.push(route.request().postDataJSON().path);data={views:1234};}
   else if(url.pathname.includes('/comments'))data=[];
   else if(url.pathname==='/api/auth/providers')data={providers:[{provider:'microsoft',name:'Microsoft'}]};
   await route.fulfill({json:data});
  });
  for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:900});await page.goto('http://127.0.0.1:4199/admin/analytics');await page.getByRole('heading',{name:'访问统计',exact:true}).waitFor();await page.getByRole('heading',{name:'访问趋势',exact:true}).waitFor();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.getByRole('button',{name:'近 7 天',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.analytics-bar-track').length===7);
   await page.locator('.analytics-daily summary').click();assert.equal(await page.locator('.analytics-table-row').count(),8);
   await page.screenshot({path:`.cache/analytics-${width}.png`});
  }
  await page.evaluate(()=>document.documentElement.classList.add('dark'));await page.screenshot({path:'.cache/analytics-dark.png'});
  assert.deepEqual(tracked,[],'admin pages never emit views');
  fail=true;await page.getByRole('button',{name:'近 30 天',exact:true}).click();await page.getByRole('alert').waitFor();fail=false;await page.getByRole('button',{name:'重新加载',exact:true}).click();await page.getByRole('heading',{name:'访问趋势',exact:true}).waitFor();
  role='user';await page.goto('http://127.0.0.1:4199/article/123');await page.getByLabel('1234 次阅读',{exact:true}).waitFor();assert.equal(tracked.filter(x=>x==='/article/123').length,1);assert.equal(await page.locator('.article-view-count svg').count(),1);
  await page.screenshot({path:'.cache/article-views.png'});assert.deepEqual(errors,[]);
  console.log('PASS: statistics ranges/error recovery, mobile/desktop layout, article count and admin exclusion.');
 }finally{await browser?.close();await server.httpServer.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

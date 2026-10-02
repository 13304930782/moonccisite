const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const {preview}=await import('vite');const server=await preview({preview:{host:'127.0.0.1',port:4217,strictPort:true}});let browser;
 try{
  browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));let fail=false;
  await page.route('**/api/**',async route=>{
   const url=new URL(route.request().url());let data={};
   if(url.pathname==='/api/auth/me')data={user:{id:1,username:'tester',email:'test@example.test',role:'owner',status:'active'}};
   else if(url.pathname==='/api/admin/runtime'){
    if(fail)return route.fulfill({status:503,json:{message:'运行信息暂时不可用'}});
    data={checkedAt:new Date().toISOString(),api:{startedAt:'2026-09-19T00:00:00Z',node:'v24.20.0'},worker:{state:'unknown',startedAt:null,checkedAt:null},deployment:{revision:'a'.repeat(40),completedAt:null,result:'unknown'},disk:{freeBytes:10,totalBytes:100},migrations:[{filename:'202609190001_'+ 'very_long_migration_'.repeat(12)+'.sql',executedAt:'2026-09-19T00:00:00Z'}]};
   }await route.fulfill({json:data});
  });
  for(const width of [375,768,1440])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:960});await page.goto('http://127.0.0.1:4217/admin/runtime');
   await page.getByRole('heading',{name:'已执行迁移',exact:true}).waitFor();
   await page.evaluate(t=>document.documentElement.classList.toggle('dark',t==='dark'),theme);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert(await page.locator('.admin-content').evaluate(e=>e.scrollWidth<=e.clientWidth));
   await page.getByRole('button',{name:'刷新状态',exact:true}).focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:'刷新状态',exact:true}).waitFor();
   await page.screenshot({path:`.cache/runtime-${width}-${theme}.png`});
  }
  fail=true;await page.getByRole('button',{name:'刷新状态',exact:true}).click();await page.getByText('运行信息暂时不可用',{exact:true}).waitFor();
  fail=false;await page.getByRole('button',{name:'刷新状态',exact:true}).click();await page.getByRole('button',{name:'刷新状态',exact:true}).waitFor();
  assert.deepEqual(errors,[]);console.log('PASS runtime page: six viewports/themes, keyboard refresh, long identifiers and error recovery');
 }finally{await browser?.close();await server.httpServer.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

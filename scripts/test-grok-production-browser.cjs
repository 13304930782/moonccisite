const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {chromium}=require('playwright');

(async()=>{
 const {preview}=await import('vite');
 const server=await preview({preview:{host:'127.0.0.1',port:4997,strictPort:true},logLevel:'error'});
 let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error'&&!/401 \(Unauthorized\)/.test(message.text()))errors.push(message.text())});
  await page.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/api/auth/session')return route.fulfill({status:401,json:{message:'not logged in'}});
   if(['/api/posts','/api/categories','/api/tags'].includes(path))return route.fulfill({json:[]});
   const json=path==='/api/settings/site'?{brand:{},hero:{},footer:{}}:path==='/api/weather-mood'?{data:{status:'needs_location',mode:'weather',refreshAt:'2099-01-01T00:00:00Z'}}:path==='/api/weather-mood/interactions'?{data:{date:'2026-11-09',pets:0,hits:0}}:{items:[],total:0};
   return route.fulfill({json});
  });
  await page.goto('http://127.0.0.1:4997/');
  await page.locator('.weather-companion-ball').waitFor({timeout:15000}).catch(async error=>{console.error('body:',(await page.locator('body').innerText()).slice(0,1000),'errors:',errors);throw error;});
  await page.waitForFunction(()=>Boolean(window.EB_RINGS?.EXPRESSIONS));
  const source=fs.readFileSync('src/vendor/grok-ball/grok-ball.js','utf8'),start=source.indexOf('window.EB_RINGS = '),end=source.indexOf('\n};',start)+3;
  const context={window:{}};vm.runInNewContext(source.slice(start,end),context);
  assert.equal(await page.evaluate(()=>JSON.stringify(window.EB_RINGS)),JSON.stringify(context.window.EB_RINGS));
  assert.deepEqual(errors,[]);
  console.log('Production Grok geometry and mascot render passed.');
 }finally{await browser?.close();server.httpServer.close();}
})().catch(error=>{console.error(error);process.exitCode=1});

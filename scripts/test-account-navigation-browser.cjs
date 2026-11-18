const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const external=process.env.ACCOUNT_PREVIEW_URL;
 const server=external?null:await (await import('vite')).preview({preview:{host:'127.0.0.1',port:4995,strictPort:true},logLevel:'error'});
 const base=external||'http://127.0.0.1:4995';
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
 const out=path.resolve('.cache/account-navigation');fs.mkdirSync(out,{recursive:true});
 const errors=[],results=[];
 try{
  for(const width of [320,360,375,768,1440])for(const locale of ['zh-CN','en'])for(const theme of ['light','dark']){
   const context=await browser.newContext({viewport:{width,height:844},locale,reducedMotion:'reduce'});
   await context.addInitScript(({locale,theme})=>{localStorage.setItem('mooncci-theme',theme);localStorage.setItem('mooncci:language',JSON.stringify({preference:innerWidth===360?'system':locale,version:1}));}, {locale,theme});
   const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/api/**',route=>{
    const p=new URL(route.request().url()).pathname;
    let body={items:[],total:0,page:1,pageSize:20};
    if(p==='/api/auth/session'||p==='/api/account')body={user:{id:1,username:'mooncci',role:'owner',status:'active',version:1}};
    else if(p==='/api/settings/site')body={brand:{},hero:{},footer:{},weather:{enabled:false},weather_companion:{enabled:false}};
    else if(['/api/publishing/config','/api/engagement/config','/api/account/security-config'].includes(p))body={enabled:true};
    else if(p==='/api/engagement/notifications/unread')body={unread:0};
    else if(p==='/api/auth/providers'||p==='/api/auth/connections')body={providers:[]};
    return route.fulfill({json:body});
   });
   await page.goto(base+'/account/sessions');
   await page.locator('.language-trigger').filter({hasText:width===360?(locale==='en'?'System':'跟随系统'):(locale==='en'?'English':'中文')}).waitFor();
   const active=page.locator('.account-sidebar nav a[aria-current=page]');try{await active.waitFor();}catch(error){console.error({width,locale,theme,url:page.url(),errors,body:await page.locator('body').innerText()});await page.screenshot({path:path.join(out,'failure.png'),fullPage:true});throw error;}
   await page.waitForFunction(()=>{const nav=document.querySelector('.account-sidebar nav'),a=nav?.querySelector('[aria-current=page]');if(!a)return false;const n=nav.getBoundingClientRect(),r=a.getBoundingClientRect();return r.left>=n.left-1&&r.right<=n.right+1;});
   const sizes=await page.evaluate(()=>{
    const nav=document.querySelector('.account-sidebar nav'),links=[...nav.querySelectorAll('a')],header=document.querySelector('.account-topbar');
    return {overflow:document.documentElement.scrollWidth>innerWidth,navTop:links.map(a=>a.getBoundingClientRect().top),targets:links.map(a=>({width:a.getBoundingClientRect().width,height:a.getBoundingClientRect().height})),header:header.getBoundingClientRect().height,headerOverflow:header.scrollWidth>header.clientWidth,theme:document.documentElement.classList.contains('dark')};
   });
   assert.equal(sizes.overflow,false,`${width} ${locale}: page overflow`);assert.equal(sizes.headerOverflow,false,'header overflow');assert.equal(sizes.theme,theme==='dark');
   if(width<=760){
    assert.ok(Math.max(...sizes.navTop)-Math.min(...sizes.navTop)<1,'mobile navigation is one row');
    assert.ok(sizes.targets.every(t=>t.height>=44&&t.width>=44),'navigation touch targets');
    assert.ok(sizes.header<=(width>=360?70:120),'compact mobile header');
    for(const control of await page.locator('.account-topbar a,.account-topbar button').all()){
     if(!await control.isVisible())continue;const b=await control.boundingBox();assert.ok(b.height>=44&&b.width>=44,'header touch target '+await control.getAttribute('aria-label'));
    }
   }else assert.ok(Math.max(...sizes.navTop)-Math.min(...sizes.navTop)>100,'desktop sidebar remains vertical');
   if(width===375){
    await active.focus();await page.keyboard.press('Shift+Tab');
    assert.ok(await page.evaluate(()=>{const n=document.querySelector('.account-sidebar nav').getBoundingClientRect(),a=document.activeElement.getBoundingClientRect();return a.left>=n.left-1&&a.right<=n.right+1;}),'keyboard focus visible in nav');
    await page.goto(base+'/account/motion');await page.locator('.motion-choice').first().waitFor();
    await page.screenshot({path:path.join(out,`${locale}-${theme}-375.png`),fullPage:true});
   }
   if(width===1440&&locale==='zh-CN'&&theme==='light'){
    await page.setViewportSize({width:360,height:844});
    await page.waitForFunction(()=>{const n=document.querySelector('.account-sidebar nav').getBoundingClientRect(),a=document.querySelector('.account-sidebar nav a[aria-current=page]').getBoundingClientRect();return a.left>=n.left-1&&a.right<=n.right+1;});
    await page.locator('.account-sidebar nav a[href="/account/motion"]').click();
    await page.locator('.motion-choice').first().waitFor();
    assert.equal(await page.locator('.account-sidebar nav a[aria-current=page]').getAttribute('href'),'/account/motion');
    await page.setViewportSize({width:1440,height:844});
    assert.equal(await page.locator('.account-sidebar nav').evaluate(el=>getComputedStyle(el).display),'grid','resize restores desktop sidebar');
   }
   results.push({width,locale,theme,header:sizes.header});await context.close();
  }
  assert.deepEqual(errors,[],'no render errors');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(`PASS ${results.length} viewport / locale / theme states; no overflow, active tab visible, keyboard navigation and 44px mobile targets.`);
 }finally{await browser.close();await server?.httpServer.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

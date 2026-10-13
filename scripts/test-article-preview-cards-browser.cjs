const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium, webkit} = require('playwright');

const portrait = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#eee"/><rect width="600" height="100" fill="#c55"/><rect y="700" width="600" height="100" fill="#55c"/></svg>';
const post = {id:1,title:'完整竖图测试',summary:'用完整竖图检查列表展示与发布预览，顶部和底部色条都应可见。',content:'正文内容。',summary_mode:'manual',cover_image:'/api/uploads/portrait.webp',tags:[],published_at:'2026-10-13'};

(async()=>{
 const server = await (await import('vite')).preview({preview:{host:'127.0.0.1',port:4269,strictPort:true}});
 fs.mkdirSync('.cache',{recursive:true});
 try {
  for (const [name,engine] of Object.entries({chromium,webkit})) {
   if(process.env.PLAYWRIGHT_TEST_BROWSERS&&!process.env.PLAYWRIGHT_TEST_BROWSERS.split(',').includes(name))continue;
   const browser = await engine.launch({headless:true,...(name==='chromium'&&process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
   let releaseStyles;
   try {
    const page = await browser.newPage({viewport:{width:390,height:900}});
    const errors = [];page.on('pageerror',error=>errors.push(error.message));
    const stylesheetGate = new Promise(resolve=>{releaseStyles=resolve;});
    let stalledStyles = 0;
    let draft = {id:'11111111-1111-4111-8111-111111111111',version:1,payload:post,workflow:{state:'draft'}};
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await page.route('**/fixture-review.css',async route=>{
     if(route.request().frame()!==page.mainFrame()){stalledStyles++;await stylesheetGate;}
     await route.fulfill({contentType:'text/css',body:'/* intentionally delayed iframe stylesheet */'});
    });
    await page.route('**/api/**',route=>{
     const path=new URL(route.request().url()).pathname,method=route.request().method();let json={};
     if(path.includes('/image-variants/')||path==='/api/uploads/portrait.webp')return route.fulfill({contentType:'image/svg+xml',body:portrait});
     if(path==='/api/auth/session')json={user:{id:1,role:'owner',username:'fixture'}};
     else if(path==='/api/publishing/config')json={enabled:true};
     else if(path.startsWith('/api/article-drafts')){if(method==='PUT')draft={...draft,version:draft.version+1,payload:route.request().postDataJSON().payload};json=draft;}
     else if(path==='/api/posts')json={items:[post,{...post,id:2,title:'保留手动取景',cover_crop:{card:{x:.5,y:.8,zoom:2},detail:null}}],total:2,page:1,pageSize:12};
     return route.fulfill({json});
    });
    await page.goto('http://127.0.0.1:4269/admin/write?draft='+draft.id);
    await page.evaluate(()=>new Promise(resolve=>{const link=document.createElement('link');link.rel='stylesheet';link.href='/fixture-review.css';link.onload=resolve;document.head.appendChild(link);}));
    await page.getByRole('button',{name:'预览并发布',exact:true}).click();
    const check=page.getByRole('button',{name:'运行发布前检查',exact:true});
    await check.waitFor();
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent==='运行发布前检查'&&!button.disabled),null,{timeout:3000});
    await page.frameLocator('iframe[title="文章设备预览"]').getByRole('heading',{name:post.title,exact:true}).waitFor();
    assert.ok(stalledStyles>0,'the iframe stylesheet must still be pending');
    await check.click();
    await page.getByRole('heading',{name:'检查通过，可以继续',exact:true}).waitFor();
    assert.ok(await page.getByRole('button',{name:'确认发布',exact:true}).isEnabled());
    releaseStyles();
    // Repeat mounting with the stylesheet now cached, covering missed load events.
    await page.getByRole('button',{name:'返回编辑',exact:true}).first().click();
    await page.getByRole('button',{name:'预览并发布',exact:true}).click();
    await check.click();
    await page.getByRole('heading',{name:'检查通过，可以继续',exact:true}).waitFor();
    await page.goto('http://127.0.0.1:4269/articles');
    await page.locator('.blog-card').first().waitFor();
    for(const width of [320,390,768,1440])for(const dark of [false,true]) {
     await page.setViewportSize({width,height:950});
     await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),dark);
     const image=page.locator('.blog-card > img').first();await image.evaluate(img=>img.decode());
     const box=await image.evaluate(img=>{const css=getComputedStyle(img),rect=img.getBoundingClientRect();return {width:rect.width,height:rect.height,fit:css.objectFit,naturalRatio:img.naturalWidth/img.naturalHeight};});
     assert.equal(box.fit,'contain');assert.equal(box.width,width<=760?112:180);
     assert.ok(Math.abs(box.width/box.height-box.naturalRatio)<.01,'portrait must retain its full aspect ratio');
     const framed=page.locator('.blog-card-cover').first(),framedImage=framed.locator('img');
     const frameBox=await framed.boundingBox();assert.ok(Math.abs(frameBox.width/frameBox.height-1.6)<.01);
     assert.equal(await framedImage.evaluate(img=>getComputedStyle(img).objectFit),'cover');
     assert.equal(await framedImage.evaluate(img=>getComputedStyle(img).transform),'matrix(2, 0, 0, 2, 0, 0)');
     assert.match(await framedImage.getAttribute('sizes'),/224px, 360px/);
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page must not overflow');
     await page.screenshot({path:`.cache/article-card-${name}-${width}-${dark}.png`,fullPage:true,animations:'disabled'});
    }
    assert.deepEqual(errors,[]);
    console.log(`PASS ${name}: stalled/cached preview styles, publication checks, complete portrait, saved crop and 320/390/768/1440 light/dark layouts.`);
   } finally {releaseStyles?.();await browser.close();}
  }
 } finally {await new Promise(resolve=>server.httpServer.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium, webkit} = require('playwright');

const portrait = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#eee"/><rect width="600" height="100" fill="#c55"/><rect y="700" width="600" height="100" fill="#55c"/></svg>';
const post = {id:1,title:'完整竖图测试',summary:'用完整竖图检查列表展示与发布预览，顶部和底部色条都应可见。',content:'正文内容。',summary_mode:'manual',cover_image:'/api/uploads/portrait.webp',tags:[],published_at:'2026-10-13'};
const legacyCrop={card:{x:.17,y:.91,zoom:2.2},detail:{x:.25,y:.65,zoom:1.4}};
const posts=[post,{...post,id:2,title:'旧卡片取景也完整显示',cover_crop:legacyCrop},{...post,id:3,title:'完整横图',cover_image:'/api/uploads/landscape.webp',cover_crop:legacyCrop},{...post,id:4,title:'完整方图',cover_image:'/api/uploads/square.webp',cover_crop:legacyCrop}];
const images={
 'portrait.webp':process.env.QA_CARD_PORTRAIT?{contentType:'image/png',body:fs.readFileSync(process.env.QA_CARD_PORTRAIT)}:{contentType:'image/svg+xml',body:portrait},
 'landscape.webp':{contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="900" height="450"><rect width="900" height="450" fill="#ddd"/><rect width="80" height="450" fill="#c55"/><rect x="820" width="80" height="450" fill="#55c"/></svg>'},
 'square.webp':{contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#ccc"/><rect width="600" height="70" fill="#c55"/><rect y="530" width="600" height="70" fill="#55c"/></svg>'},
};

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
     const url=new URL(route.request().url()),path=url.pathname,method=route.request().method();let json={};
     if(path.includes('/image-variants/')||path.startsWith('/api/uploads/'))return route.fulfill(images[path.split('/').at(-1)]);
     if(path==='/api/auth/session')json={user:{id:1,role:'owner',username:'fixture'}};
     else if(path==='/api/publishing/config')json={enabled:true};
     else if(path.startsWith('/api/article-drafts')){if(method==='PUT')draft={...draft,version:draft.version+1,payload:route.request().postDataJSON().payload};json=draft;}
     else if(path==='/api/posts')json=url.searchParams.get('format')==='paged'?{items:posts,total:4,page:1,pageSize:12}:posts;
     else if(path==='/api/bookmarks')json={items:posts.map(p=>({...p,post_id:p.id,available:true})),total:4,page:1,pageSize:12};
     else if(path==='/api/series/card-fixture')json={series:{title:'完整封面专栏',description:'完整图片回归'},items:posts};
     else if(path==='/api/series')json={items:posts.map(p=>({...p,slug:'card-fixture',article_count:4}))};
     else if(path==='/api/engagement/config')json={enabled:false};
     else if(path==='/api/settings/site')json={brand:{name:'mooncci'},hero:{title:'完整卡片测试'},footer:{},navigation:[],about:{enabled:false}};
     else if(path==='/api/now')json={content:'本地回归'};
     else if(path.startsWith('/api/activity')||path.startsWith('/api/projects'))json={items:[],total:0};
     return route.fulfill({json});
    });
    await page.goto('http://127.0.0.1:4269/admin/write?draft='+draft.id);
    await page.evaluate(()=>new Promise(resolve=>{const link=document.createElement('link');link.rel='stylesheet';link.href='/fixture-review.css';link.onload=resolve;document.head.appendChild(link);}));
    await page.getByRole('button',{name:'发布',exact:true}).click();
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
    await page.getByRole('button',{name:'发布',exact:true}).click();
    await check.click();
    await page.getByRole('heading',{name:'检查通过，可以继续',exact:true}).waitFor();
    for(const width of [320,390,768,1440])for(const dark of [false,true]) {
     await page.setViewportSize({width,height:950});
     for(const routePath of width===390||width===1440?['/articles','/','/account/bookmarks','/series/card-fixture','/series']:['/articles']) {
      await page.goto('http://127.0.0.1:4269'+routePath);
      const heading={'/':'完整卡片测试','/account/bookmarks':'我的收藏','/series/card-fixture':'完整封面专栏','/series':'文章专栏'}[routePath];
      if(heading)await page.getByRole('heading',{name:heading,exact:true}).waitFor();
      // Auth restoration intentionally invalidates public snapshots. Wait for
      // that session and its refresh before measuring the completed page.
      await page.getByText('fixture',{exact:true}).first().waitFor({state:'attached'});
      await page.waitForLoadState('networkidle');
      const selector=routePath.startsWith('/series')?'.publishing-card > img.card-cover-image':'.blog-card > img.card-cover-image';
      await page.evaluate(value=>document.documentElement.classList.toggle('dark',value),dark);
      if(routePath==='/') {
       const rows=page.locator('.home-post-list .home-post-row');
       await rows.last().waitFor();
       assert.equal(await rows.count(),4,'home preserves all article entries');
       for(let index=0;index<posts.length;index++) {
        const row=rows.nth(index),entry=posts[index];
        assert.equal(await row.getAttribute('href'),`/article/${entry.id}`);
        assert.equal(await row.locator('.home-activity-title').innerText(),entry.title);
        assert.equal(await row.locator('.home-activity-excerpt').innerText(),entry.summary);
       }
       await page.waitForFunction(()=>[...document.querySelectorAll('.home-post-list .home-activity-thumbnail img')].every(img=>img.complete&&img.naturalWidth>0));
       assert.equal(await rows.locator('.home-activity-thumbnail img').count(),4,'home retains decorative thumbnails');
       assert.equal(await rows.locator('img:not([alt=""])').count(),0,'thumbnail does not repeat the link title');
       const thumbnails=await rows.locator('.home-activity-thumbnail').evaluateAll(elements=>elements.map(element=>{
        const rect=element.getBoundingClientRect(),img=element.querySelector('img'),style=getComputedStyle(img);
        const scale=style.transform==='none'?1:new DOMMatrix(style.transform).a;
        return {width:rect.width,height:rect.height,overflow:getComputedStyle(element).overflow,fit:style.objectFit,position:style.objectPosition,scale,imageWidth:parseFloat(style.width),imageHeight:parseFloat(style.height)};
       }));
       for(let index=0;index<thumbnails.length;index++) {
        const image=thumbnails[index],frame=posts[index].cover_crop?.card;
        assert.equal(image.width,width<=640?96:168,'home thumbnail width');
        assert.equal(image.height,width<=640?96:105,'home thumbnail height');
        assert.equal(image.imageWidth,image.width);assert.equal(image.imageHeight,image.height);
        assert.equal(image.overflow,'hidden');assert.equal(image.fit,'cover');
        assert.equal(image.position,frame?`${frame.x*100}% ${frame.y*100}%`:'50% 30%','home respects saved crop position');
        assert.equal(image.scale,frame?.zoom??1,'home respects saved crop zoom');
       }
       assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'home has no horizontal overflow');
       await page.screenshot({path:`.cache/article-card-${name}-${width}-${dark}-home.png`,fullPage:true,animations:'disabled'});
       continue;
      }
      // Take readiness and measurements in the same event-loop turn: a later
      // React refresh cannot invalidate a previously resolved locator count.
      const handle=await page.waitForFunction(selector=>{
       const images=[...document.querySelectorAll(selector)];
       if(images.length!==4||!images.every(img=>img.complete&&img.naturalWidth>0))return false;
       return {boxes:images.map(img=>{const css=getComputedStyle(img),rect=img.getBoundingClientRect();return {width:rect.width,height:rect.height,fit:css.objectFit,transform:css.transform,ratio:img.naturalWidth/img.naturalHeight,crop:img.style.getPropertyValue('--cover-x')};}),legacyContainers:document.querySelectorAll('.blog-card-cover').length,overflow:document.documentElement.scrollWidth>innerWidth};
      },selector);
      const measured=await handle.jsonValue();await handle.dispose();
      assert.equal(measured.boxes.length,4,routePath+' has all loaded image shapes');
      for(const box of measured.boxes) {
       assert.equal(box.fit,'contain');assert.equal(box.transform,'none');assert.equal(box.crop,'');
       assert.ok(Math.abs(box.width/box.height-box.ratio)<.01,'all original image edges remain visible: '+routePath);
       if(!routePath.startsWith('/series'))assert.equal(box.width,width<=760?112:180);
      }
      assert.equal(measured.legacyContainers,0,'legacy card cropping is never rendered');
      assert.equal(measured.overflow,false,'page must not overflow: '+routePath);
      if(width===390||width===1440)await page.screenshot({path:`.cache/article-card-${name}-${width}-${dark}-${routePath.replace(/\W/g,'-')||'home'}.png`,fullPage:true,animations:'disabled'});
     }
    }
    assert.deepEqual(posts[1].cover_crop,legacyCrop,'legacy fixture parameters are never mutated');
    assert.deepEqual(errors,[]);
    console.log(`PASS ${name}: publication checks; home article titles/summaries/links/thumbnails; full portrait/landscape/square and legacy-crop cards across list/bookmarks/series; 320/390/768/1440 light/dark layouts, no overflow.`);
   } finally {releaseStyles?.();await browser.close();}
  }
 } finally {await new Promise(resolve=>server.httpServer.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});

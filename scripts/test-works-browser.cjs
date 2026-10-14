const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium, webkit} = require('playwright');
const original = {id:1,slug:'promptdock',name:'PromptDock',stage:'building',status:'published',featured_rank:1,
 summary:'原生 macOS 提示词管理工具。分类与标签、模板变量和快捷搜索。',
 content:'## 核心功能\n\n真实内容读取回归。\n\n### 快速搜索\n\n搜索资料库。\n\n## 技术实现\n\nSwiftUI。',
 cover_image:'',icon_image:null,tech_stack:'SwiftUI · SwiftData · AppKit · WidgetKit · Keychain',repo:'13304930782/PromptDock',demo_url:'https://cuegroveapp.com/early-access'};
const release={id:42,title:'版本记录回归',content:'原始发布内容。',published_at:'2026-10-14',prerelease:1,url:'https://github.com/13304930782/PromptDock/releases/tag/fixture'};
(async()=>{
 const {preview}=await import('vite');const server=await preview({preview:{host:'127.0.0.1',port:4271,strictPort:true}});
 try {
  for(const engine of (process.env.PLAYWRIGHT_TEST_BROWSERS || 'chromium,webkit').split(',')){
   const browser=await ({chromium,webkit}[engine]).launch({headless:true,...(engine==='chromium'&&process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
   try {
    const page=await browser.newPage({reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    let project={...original},saved=null,releaseUpload;
    const uploadGate=new Promise(resolve=>{releaseUpload=resolve;});
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await page.route('**/api/**',async route=>{
     const url=new URL(route.request().url()),path=url.pathname,method=route.request().method();let json={};
     if(path.startsWith('/api/uploads/'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#555"/></svg>'});
     if(path==='/api/auth/session')json={user:{id:1,role:'owner',username:'works-fixture'}};
     else if(path==='/api/settings/site')json={brand:{name:'mooncci'},hero:{title:'作品设计回归'},footer:{},navigation:[],about:{enabled:false}};
     else if(path==='/api/projects'||path==='/api/admin/projects')json={items:[project],total:1,page:1,pageSize:20,syncConfigured:false};
     else if(path.startsWith('/api/projects/'))json={...project,releases:{items:[release],total:1,page:1,pageSize:20},focusedRelease:url.searchParams.get('release')==='99'?{...release,id:99,title:'分页外聚焦版本'}:null};
     else if(path==='/api/admin/projects/1'&&method==='PUT'){saved=route.request().postDataJSON();project={...project,...saved};json={ok:true};}
     else if(path==='/api/upload/image'){await uploadGate;json={url:'/api/uploads/new-icon.png'};}
     else if(path==='/api/upload/media')json=[{filename:'cover.png',url:'/api/uploads/cover.png',display_name:'作品展示图'}];
     else if(path==='/api/posts')json=[];
     else if(path==='/api/now')json={content:''};
     else if(path.startsWith('/api/activity'))json={items:[],total:0};
     else if(path==='/api/engagement/config')json={enabled:false};
     return route.fulfill({json});
    });
    for(const width of [1440,1024,390,320])for(const dark of [false,true]){
     await page.setViewportSize({width,height:900});
     for(const route of ['/','/projects','/projects/promptdock']){
      await page.goto('http://127.0.0.1:4271'+route);
      await page.getByText('works-fixture',{exact:true}).first().waitFor({state:'attached'});
      await page.waitForLoadState('networkidle');
      await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no overflow '+route+' '+width);
      if(route==='/projects/promptdock'){
       await page.getByRole('heading',{name:'PromptDock',exact:true}).waitFor();
       const body=await page.locator('.project-reading-body').boundingBox();if(width>=1024)assert.equal(body.width,720);
       const main=await page.locator('main').boundingBox();
       assert.ok(Math.abs(body.x+body.width/2-(main.x+main.width/2))<1,'720px column centered in page container '+JSON.stringify({width,main,body}));
       assert.equal(await page.locator('.project-detail-showcase').count(),0,'no fabricated screenshot');
       assert.equal((await page.locator('.project-detail-icon').boundingBox()).width,width<=600?56:72);
       for(const action of await page.locator('.project-detail-action').all())assert.ok((await action.boundingBox()).height>=44);
       assert.equal(await page.locator('.project-reading-rail').isVisible(),width>=1280);
       assert.equal(await page.locator('.project-mobile-toc').isVisible(),width<1280);
       for(const link of await page.locator('.project-reading-rail nav a').all())assert.equal(await page.locator(await link.getAttribute('href')).count(),1,'TOC target exists');
      }else{
       const card=page.locator('.project-card--compact');await card.waitFor();
       assert.equal((await card.locator('.project-card-icon').boundingBox()).width,48);
       assert.equal(await card.locator('h3').evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap');
       const name=await card.locator('h3').boundingBox();assert.ok(name.x+name.width<=width,'complete name stays in viewport');
       assert.equal(await card.evaluate(el=>getComputedStyle(el).borderTopWidth),'0px');
      }
      if(width===1440||width===390)await page.screenshot({path:`.cache/works-${engine}-${width}-${dark}-${route.replace(/\W/g,'-')||'home'}.png`,fullPage:true});
     }
    }
    project.cover_image='/api/uploads/cover.png';
    project.content='<!--mooncci-richtext:v1--><h2>富文本章节</h2><p>真实富文本接口形态。</p><h3>子章节</h3>';
    await page.goto('http://127.0.0.1:4271/projects/promptdock?release=99');
    await page.getByRole('heading',{name:'PromptDock',exact:true}).waitFor();
    const showcase=page.locator('.project-detail-showcase img');await showcase.waitFor();
    assert.equal(await showcase.evaluate(el=>getComputedStyle(el).objectFit),'contain');
    assert.equal(await page.locator('#release-99').getAttribute('open'),'');
    assert.ok(await page.locator('#release-99').isVisible());
    const toc=page.locator('.project-mobile-toc');await toc.locator('summary').focus();
    await page.keyboard.press('Enter');await toc.locator('nav').waitFor({state:'visible'});
    for(const link of await toc.locator('nav a').all())assert.equal(await page.locator(await link.getAttribute('href')).count(),1);
    await toc.getByRole('link',{name:'富文本章节',exact:true}).click();assert.equal(await toc.getAttribute('open'),null);
    assert.ok(page.url().endsWith('#project-heading-0'));
    await page.goto('http://127.0.0.1:4271/admin/projects');
    await page.getByRole('button',{name:'编辑',exact:true}).first().click();
    const iconField=page.locator('.image-field--icon');await iconField.getByAltText('作品图标预览').waitFor();
    await iconField.locator('input[type=file]').setInputFiles('src/assets/projects/promptdock-icon.png');
    await page.waitForFunction(()=>document.querySelector('button[type=submit],.editor-panel button:not([type])')?.disabled===true);
    assert.ok(await page.getByRole('button',{name:'保存作品',exact:true}).isDisabled(),'cannot save during upload');
    releaseUpload();await iconField.getByRole('textbox',{name:'作品图标',exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelector('.image-field--icon input:not([type=file])').value==='/api/uploads/new-icon.png');
    await page.getByRole('button',{name:'保存作品',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.editor-panel h2').textContent==='新建作品');
    assert.equal(saved.icon_image,'/api/uploads/new-icon.png');assert.equal(saved.cover_image,'/api/uploads/cover.png');
    await page.reload();await page.getByRole('button',{name:'编辑',exact:true}).first().click();
    assert.equal(await iconField.getByRole('textbox',{name:'作品图标',exact:true}).inputValue(),'/api/uploads/new-icon.png');
    await iconField.getByRole('button',{name:'移除图标',exact:true}).click();
    await page.getByRole('button',{name:'保存作品',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.editor-panel h2').textContent==='新建作品');
    assert.equal(saved.icon_image,'');assert.equal(saved.cover_image,'/api/uploads/cover.png');
    await page.goto('http://127.0.0.1:4271/projects/promptdock');await page.getByRole('heading',{name:'PromptDock',exact:true}).waitFor();
    assert.equal(await page.locator('.project-detail-icon').count(),0,'explicit removal never restores branded default');
    assert.deepEqual(errors,[]);
    console.log(`PASS ${engine}: compact home/list; article-style detail; responsive themes; Markdown/rich TOC; focused releases; isolated icon upload/save/reload/remove and screenshot independence.`);
   }finally{await browser.close();}
  }
 }finally{await server.httpServer.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

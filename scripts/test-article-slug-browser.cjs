const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const {preview}=await import('vite');
 const server=await preview({preview:{host:'127.0.0.1',port:4199,strictPort:true},logLevel:'error'});
 let browser,page;
 try{
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
  page=await browser.newPage({viewport:{width:1440,height:950},reducedMotion:'reduce'});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const post={id:20,slug:'cities-skylines-2-basic-mods',title:'Cities Skylines 2 Mods',status:'published',content:'<!--mooncci-richtext:v1--><h1>1. Anarchy</h1><p>First mod</p><h2>2. Move It</h2>',tags:[],summary_mode:'manual',summary:'Mod guide',published_at:'2026-10-23T00:00:00Z'};
  let draft={id:'slug-fixture',version:1,post_id:20,post_status:'published',payload:{...post,slug:'old-mods'},updated_at:new Date().toISOString()},fail=false,slugCalls=0;
  await page.route('**/api/**',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method();let body={};
   if(path==='/api/auth/session')body={user:{id:1,username:'Writer',role:'owner'}};
   else if(path==='/api/article-seo/status')body={enabled:true};
   else if(path==='/api/article-seo/slug'){
    slugCalls++;assert.equal(req.postDataJSON().payload.title,post.title);
    if(fail){await route.fulfill({status:503,json:{message:'DeepSeek 暂时不可用'}});return;}
    body={slug:'cities-skylines-2-basic-mods'};
   }
   else if(path.startsWith('/api/article-drafts')){
    if(method==='PUT')draft={...draft,payload:req.postDataJSON().payload,version:draft.version+1};
    body=draft;
   }
   else if(path==='/api/posts/20'||path==='/api/posts/cities-skylines-2-basic-mods')body=post;
   else if(path.endsWith('/discovery'))body={previous:null,next:null,related:[]};
   else if(path==='/api/seo')body={title:post.title,canonical:'http://127.0.0.1:4199/article/'+post.slug,robots:'index, follow'};
   else if(path==='/api/comments/post/20')body=[];
   else if(path==='/api/series/article/20')body=null;
   else if(path==='/api/settings/site')body={brand:{site_title:'mooncci'},hero:{},footer:{}};
   await route.fulfill({json:body});
  });
  await page.goto('http://127.0.0.1:4199/article/20#heading-0');
  await page.waitForURL('**/article/cities-skylines-2-basic-mods#heading-0');
  await page.locator('h2#heading-0').waitFor();assert.equal(await page.locator('h1').count(),1);
  assert.equal(await page.locator('h2#heading-0').innerText(),'1. Anarchy');
  assert.ok(await page.locator('nav[aria-label="文章目录"] a[href="#heading-0"]').count());
  await page.goto('http://127.0.0.1:4199/admin/posts/20/edit?draft=slug-fixture');
  const input=page.locator('#article-slug');await input.waitFor({state:'visible'});
  await input.fill('archives');
  await page.getByRole('alert').filter({hasText:'这个英文链接已被系统使用'}).waitFor();
  assert.equal(await input.getAttribute('aria-invalid'),'true');
  await input.fill('manual-mod-guide');
  await page.getByRole('button',{name:'DeepSeek 生成英文链接',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#article-slug')?.value==='cities-skylines-2-basic-mods');
  assert.equal(slugCalls,1);await input.fill('final-manual-link');
  fail=true;await page.getByRole('button',{name:'DeepSeek 生成英文链接',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'DeepSeek 暂时不可用'}).waitFor();
  assert.equal(await input.inputValue(),'final-manual-link');
  await input.fill('saved-manual-link');await page.keyboard.press('Control+s');
  await page.waitForFunction(()=>document.querySelector('.writing-save-state')?.getAttribute('data-state')==='saved');
  assert.equal(draft.payload.slug,'saved-manual-link');
  await page.setViewportSize({width:390,height:950});
  await page.getByRole('button',{name:'更多文章操作',exact:true}).click();
  await page.getByRole('menuitem',{name:'文章设置',exact:true}).click();
  await input.waitFor({state:'visible'});await input.fill('mobile-manual-link');
  const generate=page.getByRole('button',{name:'DeepSeek 生成英文链接',exact:true});await generate.scrollIntoViewIfNeeded();
  assert.ok((await generate.boundingBox()).height>=44);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));

  assert.deepEqual(errors,[]);console.log('PASS: slug routing preserves anchor, one article H1, manual/AI links and failure preservation.');
 }catch(error){if(page)console.error('Browser state:',page.url(),(await page.locator('body').innerText()).slice(0,3500));throw error;}finally{await browser?.close();await server.httpServer.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

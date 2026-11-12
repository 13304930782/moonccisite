const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const server=await(await import('vite')).preview({preview:{host:'127.0.0.1',port:4261,strictPort:true}});
 const browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:process.platform==='win32'?{channel:'msedge'}:{})});
 try {
  const page=await browser.newPage({locale:'zh-CN',viewport:{width:390,height:900}});page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const requests={a:0,b:0};let publishes=0;
  let draft={id:'11111111-1111-4111-8111-111111111111',version:1,payload:{title:'逐张图片检查',summary:'本文用于检验文章发布前的图片检查与逐张重试。',summary_mode:'manual',content:'正文内容\n\n![图片一](/fixture-a.svg)\n\n![图片二](/fixture-b.svg)',tags:[]},workflow:{state:'draft'}};
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.route('**/fixture-*.svg',r=>{const key=r.request().url().includes('fixture-a')?'a':'b';requests[key]++;return r.fulfill({status:404,body:'missing'});});
  await page.route('**/api/**',r=>{const p=new URL(r.request().url()).pathname,m=r.request().method();let json={};
   if(p==='/api/auth/session')json={user:{id:1,role:'owner',username:'fixture'}};
   else if(p==='/api/publishing/config')json={enabled:true};
   else if(p.endsWith('/publish')){publishes++;json=draft;}
   else if(p.startsWith('/api/article-drafts')){if(m==='PUT')draft={...draft,version:draft.version+1,payload:r.request().postDataJSON().payload};json=draft;}
   return r.fulfill({json});
  });
  await page.goto('http://127.0.0.1:4261/admin/write?draft='+draft.id);
  const missingA=page.waitForResponse(response=>response.url().includes('/fixture-a.svg')&&response.status()===404);
  const missingB=page.waitForResponse(response=>response.url().includes('/fixture-b.svg')&&response.status()===404);
  await page.getByRole('button',{name:'发布',exact:true}).click();
  await page.frameLocator('iframe[title="文章设备预览"]').locator('img').first().waitFor();
  await Promise.all([missingA,missingB]);
  assert.equal(await page.getByRole('button',{name:'运行发布前检查',exact:true}).count(),0);
  assert.ok(await page.getByRole('button',{name:'确认发布',exact:true}).isEnabled());
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:950});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  assert.equal(publishes,0,'preview does not publish');
  await page.getByRole('button',{name:'确认发布',exact:true}).click();
  await page.waitForFunction(()=>document.body.textContent.includes('文章已发布'));
  assert.equal(publishes,1);assert.equal(draft.payload.title,'逐张图片检查');assert.deepEqual(errors,[]);
  assert.ok(requests.a>0&&requests.b>0,'the preview exercised both missing images');
  console.log('PASS: missing images remain visible in preview and no longer block explicit publication; 320/390/768/1440.');
 }finally{await browser.close();await new Promise(resolve=>server.httpServer.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});

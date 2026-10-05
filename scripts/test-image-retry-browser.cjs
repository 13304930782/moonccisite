const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{
 const server=await(await import('vite')).createServer({server:{host:'127.0.0.1',port:4261,strictPort:true,hmr:false,watch:{ignored:['**/.cache/**','**/outputs/**']}}});await server.listen();
 const browser=await chromium.launch({...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:process.platform==='win32'?{channel:'msedge'}:{})});
 try {
  const page=await browser.newPage({viewport:{width:390,height:900}});page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const ready={a:false,b:false},requests={a:0,b:0};let publishes=0;
  let draft={id:'11111111-1111-4111-8111-111111111111',version:1,payload:{title:'逐张图片检查',content:'正文内容\n\n![图片一](/fixture-a.svg)\n\n![图片二](/fixture-b.svg)',tags:[]},workflow:{state:'draft'}};
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.route('**/fixture-*.svg',r=>{const key=r.request().url().includes('fixture-a')?'a':'b';requests[key]++;return ready[key]?r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320"><rect width="640" height="320" fill="#ddd"/></svg>'}):r.fulfill({status:404,body:'missing'});});
  await page.route('**/api/**',r=>{const p=new URL(r.request().url()).pathname,m=r.request().method();let json={};
   if(p==='/api/auth/me')json={user:{id:1,role:'owner',username:'fixture'}};
   else if(p==='/api/publishing/config')json={enabled:true};
   else if(p.endsWith('/publish')){publishes++;json=draft;}
   else if(p.startsWith('/api/article-drafts')){if(m==='PUT')draft={...draft,version:draft.version+1,payload:r.request().postDataJSON().payload};json=draft;}
   return r.fulfill({json});
  });
  await page.goto('http://127.0.0.1:4261/admin/write?draft='+draft.id);
  await page.getByRole('button',{name:'预览并发布',exact:true}).click();
  await page.getByRole('button',{name:'运行发布前检查',exact:true}).click();
  await page.getByRole('button',{name:'重试图片 1',exact:true}).waitFor();
  await page.getByRole('button',{name:'重试图片 2',exact:true}).waitFor();
  assert.ok(await page.getByRole('button',{name:'确认发布',exact:true}).isDisabled());
  fs.mkdirSync('outputs/version-unification',{recursive:true});
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:950});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`outputs/version-unification/image-retry-${width}.png`,fullPage:true});}
  const oldB=requests.b;ready.a=true;
  await page.getByRole('button',{name:'重试图片 1',exact:true}).click();
  await page.getByRole('button',{name:'重试图片 1',exact:true}).waitFor({state:'detached'});
  assert.equal(requests.b,oldB,'retrying image one must not request image two');
  await page.frameLocator('iframe[title="文章设备预览"]').locator('img').first().evaluate(image=>image.decode());
  assert.ok(await page.getByRole('button',{name:'确认发布',exact:true}).isDisabled());
  ready.b=true;await page.getByRole('button',{name:'重试图片 2',exact:true}).click();
  await page.getByRole('heading',{name:'检查通过，可以继续',exact:true}).waitFor();
  assert.ok(await page.getByRole('button',{name:'确认发布',exact:true}).isEnabled());
  assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'检查通过，可以继续');
  assert.equal(publishes,0);assert.equal(draft.payload.title,'逐张图片检查');assert.deepEqual(errors,[]);
  console.log('PASS: independent retry, failed images remain blocking, no extra image requests, focus recovery, input retained, 320/390/768/1440.');
 }finally{await browser.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

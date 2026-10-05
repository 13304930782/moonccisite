
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const {preview}=await import('vite');const server=await preview({preview:{host:'127.0.0.1',port:4198,strictPort:true}});
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  let role='user',draft={id:'aaaa1111-1111-4111-8111-111111111111',version:1,payload:{title:'在山间写一篇文章',content:'## 出发之前\n\n一次徒步与写作的记录。',tags:[],summary:'保留每一次观察。'},workflow:{state:'draft'}},series=[];
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.route('**/api/**',async route=>{
   const url=new URL(route.request().url()),p=url.pathname,m=route.request().method();let body={};
   if(p==='/api/auth/me')body={user:{id:1,username:'创作者',role}};
   else if(p==='/api/publishing/config')body={enabled:true};
   else if(p==='/api/article-drafts'&&m==='GET')body={items:[draft],total:1,page:1,pageSize:20};
   else if(p.startsWith('/api/article-drafts/')&&p.endsWith('/revisions'))body={items:[],total:0};
   else if(p==='/api/article-drafts'&&m==='POST')body=draft;
   else if(p.startsWith('/api/article-drafts/')){if(m==='PUT'){const input=route.request().postDataJSON();draft={...draft,version:draft.version+1,payload:input.payload};}body=draft;}
   else if(p==='/api/publishing/queue')body={items:[{draft_id:draft.id,draft_version:draft.version,state:draft.workflow.state,snapshot:draft.payload,title:draft.payload.title,author_name:'创作者'}].filter(x=>x.state===url.searchParams.get('state')),total:1,page:1,pageSize:20};
   else if(p.startsWith('/api/publishing/')){const action=p.split('/').pop();draft.workflow.state=({submit:'submitted',cancel:'draft',approve:'approved',reject:'rejected',schedule:'scheduled',publish:'published'})[action];body=draft.workflow;}
   else if(p==='/api/series'){if(m==='POST'){series.push({...route.request().postDataJSON(),id:1,article_count:0});body={id:1};}else body={items:series};}
   else if(p.startsWith('/api/series/manage/'))body={items:[]};
   else if(p==='/api/site-settings')body={brand:{},weather:{enabled:false}};
   await route.fulfill({json:body});
  });
  await page.goto('http://127.0.0.1:4198/account/submissions');
  await page.getByRole('heading',{name:'我的投稿'}).waitFor();
  assert.equal(await page.getByRole('link',{name:'控制台'}).count(),0);
  await page.getByRole('link',{name:'继续编辑'}).click();
  await page.getByRole('textbox',{name:'标题',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'预览并发布',exact:true}).count(),0);
  await page.getByRole('button',{name:'预览并提交审核',exact:true}).click();
  await page.getByRole('button',{name:'运行发布前检查',exact:true}).click();
  await page.getByRole('button',{name:'确认提交审核',exact:true}).click();
  await page.getByText('待管理员审核',{exact:true}).waitFor();
  assert.equal(draft.workflow.state,'submitted');
  assert.equal(await page.getByRole('dialog').count(),0);
  fs.mkdirSync('.cache/publishing-qa',{recursive:true});
  for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:900});
   await page.screenshot({path:'.cache/publishing-qa/success-'+width+'.png',animations:'disabled'});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  assert.equal(await page.getByRole('button',{name:'运行发布前检查',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'保存草稿',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'修订历史',exact:true}).count(),0);
  await page.reload();
  await page.getByText('待管理员审核',{exact:true}).waitFor();
  assert.equal(await page.getByRole('dialog').count(),0);
  assert.equal(await page.getByRole('button',{name:'正在保存 / 发布…',exact:true}).count(),0);
  await page.screenshot({path:'.cache/publishing-qa/submitted-readonly.png',animations:'disabled'});
  await page.goto('http://127.0.0.1:4198/account/submissions');
  await page.getByRole('button',{name:'撤回审核并编辑'}).waitFor();
  fs.mkdirSync('.cache/publishing-qa',{recursive:true});
  for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:900});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'submission overflow '+width);
   await page.screenshot({path:'.cache/publishing-qa/submissions-'+width+'.png',fullPage:true});
  }
  role='admin';await page.goto('http://127.0.0.1:4198/admin/reviews');
  await page.getByRole('button',{name:'查看并处理'}).click();
  await page.getByRole('button',{name:'通过审核，安排发布',exact:true}).click();
  for(const width of [390,1280]){await page.setViewportSize({width,height:900});await page.screenshot({path:'.cache/publishing-qa/review-dialog-'+width+'.png',animations:'disabled'});const box=await page.getByRole('dialog').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);}
  await page.getByLabel('发布时间（北京时间）').fill('2099-01-01T12:00');
  await page.getByRole('button',{name:'保存发布计划'}).click();
  assert.equal(draft.workflow.state,'scheduled');
  await page.goto('http://127.0.0.1:4198/admin/schedules');
  await page.getByRole('button',{name:'查看并处理'}).waitFor();
  for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'schedule overflow '+width);
   await page.screenshot({path:'.cache/publishing-qa/schedules-'+width+'.png',fullPage:true});
  }
  await page.goto('http://127.0.0.1:4198/admin/series');await page.getByRole('button',{name:'新建专栏'}).click();
  await page.getByLabel('名称',{exact:true}).fill('写作手记');await page.getByText('自定义专栏链接（可选）',{exact:true}).click();await page.getByLabel('链接别名',{exact:true}).fill('writing-notes');await page.getByRole('button',{name:'保存专栏',exact:true}).click();
  await page.getByRole('heading',{name:'写作手记',exact:true}).waitFor();
  await page.getByRole('button',{name:'编辑与排序'}).click();
  for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'series overflow '+width);
  }
  await page.getByRole('button',{name:'切换深色主题',exact:true}).click();
  await page.waitForFunction(()=>document.documentElement.dataset.moonTheme==='dark');
  await page.evaluate(async()=>{await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));});
  await page.screenshot({path:'.cache/publishing-qa/series-dark.png',fullPage:true,animations:'disabled'});
  console.log('Theme colors',await page.locator('.admin-menu a').first().evaluate(el=>({text:getComputedStyle(el).color,background:getComputedStyle(document.querySelector('.admin-sidebar')).backgroundColor})));
  await page.getByLabel('名称',{exact:true}).focus();await page.keyboard.press('Tab');assert.equal(await page.getByText('自定义专栏链接（可选）',{exact:true}).evaluate(el=>el===document.activeElement),true);
  assert.deepEqual(errors,[]);console.log('PASS: contributor submission lock, review/scheduling, series form, keyboard and 320/390/1280 layouts; mocked API, no production writes.');
 }finally{await browser.close();await new Promise(r=>server.httpServer.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

const assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const {preview}=await import('vite');const server=await preview({preview:{host:'127.0.0.1',port:4292,strictPort:true}});
 const browser=await chromium.launch({...process.platform==='win32'?{channel:'msedge'}:{},headless:true});
 try{for(const width of [390,768,1280]){
  const page=await browser.newPage({viewport:{width,height:900}});const calls=[];let failInbox=false,historyGate,releaseHistory;
  historyGate=new Promise(r=>releaseHistory=r);
  await page.route('**/api/**',async route=>{
   const url=new URL(route.request().url()),p=url.pathname;calls.push(p+url.search);
   if(p==='/api/mailboxes/sent'){await historyGate;return route.fulfill({json:{messages:[]}});}
   if(p==='/api/mailboxes/folders/inbox'&&failInbox)return route.fulfill({status:503,json:{}});
   let body={};
   if(p==='/api/auth/session')body={user:{id:2,username:'reader',role:'user',status:'active'}};
   if(p==='/api/mailboxes/me')body={access:{status:'active',mailbox_address:'reader@mooncci.site',daily_limit:10}};
   if(/^\/api\/mailboxes\/folders\/(inbox|sent)$/.test(p)){
    const n=Number(url.searchParams.get('page')||1),sent=p.endsWith('sent');
    body={messages:[{uid:n,from:'Fixture sender',to:'Fixture recipient',subject:sent?'Sent fixture':`Inbox page ${n}`,unread:true}],total:26,page:n,pageSize:25,uidValidity:'123',folderAvailable:true};
   }
   if(p==='/api/mailboxes/folders/inbox/2')body={message:{uid:2,subject:'Inbox page 2',text:'Private fixture body',unread:false}};
   if(p==='/api/site-settings')body={brand:{},weather:{enabled:false}};
   await route.fulfill({json:body});
  });
  await page.goto('http://127.0.0.1:4292/account/mailbox');
  await page.getByText('Inbox page 1',{exact:true}).waitFor();
  assert(!calls.some(p=>/\/folders\/inbox\/\d/.test(p)),'No body prefetch / Seen mutation');
  assert(!calls.includes('/api/mailboxes/sent'));
  await page.getByRole('button',{name:'下一页',exact:true}).click();
  await page.getByText('Inbox page 2',{exact:true}).waitFor();
  const listCalls=()=>calls.filter(p=>p.startsWith('/api/mailboxes/folders/inbox?')).length;
  const before=listCalls();
  await page.getByText('Inbox page 2',{exact:true}).click();
  await page.getByText('Private fixture body',{exact:true}).waitFor();
  await page.getByRole('button',{name:'返回列表',exact:true}).click();
  await page.getByText('Inbox page 2',{exact:true}).waitFor();assert.equal(listCalls(),before);
  await page.getByRole('button',{name:'已发送',exact:true}).click();await page.getByText('Sent fixture',{exact:true}).waitFor();
  assert(!calls.includes('/api/mailboxes/sent'));
  failInbox=true;
  await page.getByRole('button',{name:'收件箱',exact:true}).click();
  await page.getByText('服务暂时不可用，请稍后重试。',{exact:true}).waitFor();
  assert.equal(await page.getByText('Inbox page 2',{exact:true}).count(),1,'Refresh failure retains same-folder page');
  assert.equal(calls.filter(p=>p.startsWith('/api/mailboxes/folders/inbox?')).at(-1),'/api/mailboxes/folders/inbox?page=2');
  assert.equal(await page.getByText('Sent fixture',{exact:true}).count(),0,'Never mix folders');
  await page.getByRole('button',{name:'已发送',exact:true}).click();await page.getByText('Sent fixture',{exact:true}).waitFor();
  await page.locator('summary').filter({hasText:'网页发送记录'}).click();
  await page.getByText('正在加载记录…',{exact:true}).waitFor();assert.equal(calls.filter(p=>p==='/api/mailboxes/sent').length,1);
  releaseHistory();await page.getByText('暂无发送记录。',{exact:true}).waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`.cache/diagnostic-qa/mail-navigation-${width}.png`,fullPage:true});
  console.log(JSON.stringify({width,requests:calls.filter(p=>p.includes('mailboxes'))}));await page.close();
 }}finally{await browser.close();await new Promise(r=>server.httpServer.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

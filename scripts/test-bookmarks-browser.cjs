const assert=require('node:assert/strict');const {chromium}=require('playwright');
(async()=>{const {preview}=await import('vite');const server=await preview({preview:{host:'127.0.0.1',port:4216,strictPort:true}});let browser;
try{browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
for(const width of [375,768,1440])for(const theme of ['light','dark']){
 const p=await browser.newPage({viewport:{width,height:950}});await p.addInitScript(t=>localStorage.setItem('mooncci-theme',t),theme);const errors=[];p.on('pageerror',e=>errors.push(e.message));
 let logged=false,saved=false,writes=0,failWrite=false,removed=false,empty=false;
 const user={id:1,username:'Reader',role:'user'};
 const post={id:1,title:'这是一个很长的收藏文章标题'.repeat(8),content:'## 收藏与继续阅读\n\n正文内容。',tags:[],published_at:'2026-09-01T00:00:00Z',author_name:'mooncci',category:'开发记录'};
 await p.route('**/api/**',async r=>{const u=new URL(r.request().url()),m=r.request().method();let data={};
 if(u.pathname==='/api/auth/me')data={user:logged?user:null};
 else if(u.pathname==='/api/auth/providers')data={providers:[]};
 else if(u.pathname==='/api/auth/login'){logged=true;data={user};}
 else if(u.pathname==='/api/posts/1')data=post;
 else if(u.pathname.includes('/comments'))data=[];
 else if(u.pathname==='/api/bookmarks/1'){
  if(m==='PUT'||m==='DELETE'){writes++;if(failWrite){await r.fulfill({status:503,json:{message:'保存失败，请重试。'}});return;}saved=m==='PUT';removed=m==='DELETE';}
  data={bookmarked:saved};
 }else if(u.pathname==='/api/bookmarks'){
  const second=u.searchParams.get('page')==='2'&&!removed;
  data={page:second?2:1,pageSize:12,total:removed?12:13,items:second?[{id:1,post_id:1,available:false}]:Array.from({length:12},(_,i)=>({...post,id:i+2,post_id:i+2,available:true,tags:[],summary:'收藏内容摘要',updated_at:'2026-09-01'}))};if(empty)data={page:1,pageSize:12,total:0,items:[]};
 }
 await r.fulfill({json:data});});
 await p.goto('http://127.0.0.1:4216/article/1');await p.getByRole('button',{name:'收藏',exact:true}).click();await p.waitForURL('**/login?redirect=*');assert.equal(new URL(p.url()).searchParams.get('redirect'),'/article/1');
 await p.getByLabel('邮箱',{exact:true}).fill('reader@example.test');await p.getByLabel('密码',{exact:true}).fill('test-password');await p.getByRole('button',{name:'登录并继续'}).click();await p.waitForURL('**/article/1');assert.equal(writes,0);
 const button=p.getByRole('button',{name:'收藏',exact:true});await button.waitFor();await button.focus();assert(await button.evaluate(e=>e===document.activeElement));await button.press('Enter');await p.getByRole('button',{name:'已收藏',exact:true}).waitFor();assert.equal(writes,1);
 // A second device changes the relation; focus refreshes it without a reload.
 saved=false;await p.evaluate(()=>window.dispatchEvent(new Event('focus')));await p.getByRole('button',{name:'收藏',exact:true}).waitFor();
 failWrite=true;await p.getByRole('button',{name:'收藏',exact:true}).click();await p.getByText('保存失败，请重试。',{exact:false}).waitFor();assert.equal(saved,false);failWrite=false;
 await p.goto('http://127.0.0.1:4216/account/bookmarks?page=2');await p.getByText('文章暂不可用',{exact:true}).waitFor();assert.equal(await p.locator('.bookmark-item a').count(),0);
 await p.getByRole('button',{name:'取消收藏：文章暂不可用'}).click();await p.waitForURL('**/account/bookmarks?page=1');await p.locator('.bookmark-item').first().waitFor();assert.equal(await p.locator('.bookmark-item').count(),12);
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await p.screenshot({path:`.cache/bookmarks-${width}-${theme}.png`,animations:'disabled'});empty=true;await p.reload();await p.getByText('还没有收藏文章。',{exact:true}).waitFor();assert.equal(await p.locator('.pagination').count(),0);await p.close();
}console.log('PASS bookmarks login return, explicit confirmation, focus sync, errors, pagination and 375/768/1440 light/dark');
}finally{await browser?.close();await server.httpServer.close();}})().catch(e=>{console.error(e);process.exitCode=1});

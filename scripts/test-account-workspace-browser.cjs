
const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{const {preview}=await import('vite');const server=await preview({preview:{host:'127.0.0.1',port:4199,strictPort:true}});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
let user={id:1,username:'mooncci',email:'writer@example.com',role:'user',status:'active',version:1,can_comment:1};
await page.route('**/api/**',async route=>{const p=new URL(route.request().url()).pathname;let body={};
if(p==='/api/auth/session')body={user};
if(p==='/api/account'){if(route.request().method()==='PUT')user={...user,...route.request().postDataJSON(),version:2};body={user,message:'资料已保存'};}
if(p==='/api/auth/connections')body={providers:[{provider:'google',name:'Google',enabled:true,bound:true}]};
if(p==='/api/publishing/config')body={enabled:true};
if(p==='/api/bookmarks')body={items:[],page:1,total:0,pageSize:20};
if(p==='/api/site-settings')body={brand:{},weather:{enabled:false}};
await route.fulfill({json:body});});
await page.goto('http://127.0.0.1:4199/account/settings');await page.getByLabel('用户名',{exact:true}).waitFor();
assert.equal(await page.getByRole('link',{name:'返回网站',exact:true}).count(),1);
await page.getByLabel('用户名',{exact:true}).fill('mooncci');await page.getByRole('button',{name:'保存资料',exact:true}).click();await page.getByText('资料已保存',{exact:true}).waitFor();
for(const width of [1280,390,320]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'settings overflow '+width);await page.screenshot({path:'.cache/publishing-qa/settings-'+width+'.png',fullPage:true,animations:'disabled'});}
await page.getByRole('button',{name:'切换深色主题'}).click();
await page.evaluate(async()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'.cache/publishing-qa/settings-dark.png',fullPage:true,animations:'disabled'});
await page.goto('http://127.0.0.1:4199/account/bookmarks');await page.getByRole('heading',{name:'还没有收藏文章',exact:true}).waitFor();
assert.equal(await page.getByRole('link',{name:'返回网站',exact:true}).count(),1);await page.getByRole('button',{name:'切换浅色主题'}).click();
for(const width of [1280,390,320]){await page.setViewportSize({width,height:900});await page.evaluate(async()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'.cache/publishing-qa/bookmarks-empty-'+width+'.png',animations:'disabled'});}
await page.route('**/api/bookmarks?*',route=>route.fulfill({json:{items:[{id:1,post_id:1,available:true,title:'山间的阅读时光',summary:'值得留住的文字，留待下一次重读。',tags:[],updated_at:'2026-09-22'},{id:2,post_id:2,available:false}],total:2,page:1,pageSize:20}}));
await page.reload();await page.getByText('文章暂不可用',{exact:true}).waitFor();
for(const width of [1280,390]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'.cache/publishing-qa/bookmarks-list-'+width+'.png',animations:'disabled'});}
assert.equal(await page.getByRole('button',{name:'取消收藏：文章暂不可用',exact:true}).count(),1);
assert.deepEqual(errors,[]);
console.log('PASS: settings save, single navigation, bookmarks empty state, desktop/mobile overflow and dark theme (mock APIs).');
}finally{await browser.close();await new Promise(r=>server.httpServer.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});

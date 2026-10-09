const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{const {preview}=await import('vite');const server=await preview({preview:{host:'127.0.0.1',port:4200,strictPort:true}});const browser=await chromium.launch({channel:'msedge',headless:true});
try{const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
let prefs={history_enabled:true,comment_email:false,reply_email:false,email_verified:true},folders=[{id:0,name:'默认收藏夹',total:1}],folderId=0,history=[{post_id:1,title:'一段可以继续的阅读',progress:.48,updated_at:Date.now()}],read=false;
await page.route('**/api/**',async route=>{const req=route.request(),u=new URL(req.url()),p=u.pathname,m=req.method();let body={};
if(p==='/api/auth/session')body={user:{id:1,username:'mooncci',role:'user'}};
else if(p==='/api/engagement/config'||p==='/api/publishing/config')body={enabled:true};
else if(p==='/api/engagement/preferences'){if(m==='PUT')prefs={...prefs,...req.postDataJSON()};body=prefs;}
else if(p==='/api/engagement/notifications/read'){read=true;body={ok:true};}
else if(p==='/api/engagement/notifications/unread')body={unread:read?0:1};
else if(p==='/api/engagement/notifications')body={unread:read?0:1,items:[{id:1,title:'你的文章收到新评论',kind:'comment',is_read:read,created_at:new Date().toISOString(),available:true,url:'/article/1'},{id:2,title:'内容已不可用',kind:'reply',is_read:true,created_at:new Date().toISOString(),available:false}],total:2};
else if(p==='/api/engagement/history'){if(m==='DELETE')history=[];body={items:history};}
else if(p==='/api/bookmark-folders'){if(m==='POST')folders.push({id:1,name:req.postDataJSON().name,total:0});body={items:folders};}
else if(p==='/api/bookmark-folders/1'){if(m==='DELETE'){folders=folders.slice(0,1);folderId=0;}if(m==='PUT')folders[1].name=req.postDataJSON().name;body={ok:true};}
else if(p.startsWith('/api/bookmark-folders/move/')){folderId=req.postDataJSON().folder_id;body={ok:true};}
else if(p==='/api/bookmarks')body={items:[{id:1,post_id:1,title:'收藏中的一篇文章',summary:'留给下次重读的记录。',available:true,tags:[],updated_at:'2026-09-22',folder_id:folderId}],total:1,page:1,pageSize:12};
else if(p==='/api/site-settings')body={brand:{},weather:{enabled:false}};
await route.fulfill({json:body});});
fs.mkdirSync('.cache/engagement-qa',{recursive:true});
const shots=async name=>{for(const width of [1280,390,320]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' overflow '+width);await page.screenshot({path:'.cache/engagement-qa/'+name+'-'+width+'.png',fullPage:true,animations:'disabled'});}};
await page.goto('http://127.0.0.1:4200/account/notifications');await page.getByText('你的文章收到新评论',{exact:true}).waitFor();await shots('notifications');
await page.getByRole('button',{name:'全部已读',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.engagement-toolbar')?.textContent.includes('0 条未读'));assert.equal(read,true);
await page.getByRole('checkbox',{name:/新评论邮件/}).click();await page.waitForFunction(()=>document.querySelector('.engagement-preferences input[type=checkbox]')?.checked);assert.equal(prefs.comment_email,true);
await page.goto('http://127.0.0.1:4200/account/history');await page.getByRole('link',{name:'一段可以继续的阅读'}).waitFor();await shots('history');
await page.getByRole('checkbox',{name:/记录阅读进度/}).click();await page.waitForFunction(()=>document.querySelector('.engagement-toggle input')?.checked===false);assert.equal(prefs.history_enabled,false);
await page.getByRole('button',{name:'清空历史',exact:true}).click();await page.getByRole('button',{name:'确认清空'}).click();await page.getByRole('heading',{name:'从下一篇文章开始'}).waitFor();
await page.goto('http://127.0.0.1:4200/account/bookmarks');await page.getByRole('button',{name:'新建收藏夹',exact:true}).click();await page.getByLabel('收藏夹名称').fill('旅行与写作');await page.screenshot({path:'.cache/engagement-qa/folder-dialog.png',animations:'disabled'});await page.getByRole('button',{name:'确认保存'}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
await page.getByRole('combobox',{name:'移动收藏：收藏中的一篇文章'}).click();await page.getByRole('option',{name:'旅行与写作',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.bookmark-move select')?.value==='1');assert.equal(folderId,1);
await page.getByRole('combobox',{name:'收藏夹',exact:true}).click();await page.getByRole('option',{name:/旅行与写作/}).click();await shots('folders');
await page.getByRole('button',{name:'重命名',exact:true}).click();await page.getByLabel('收藏夹名称').fill('阅读笔记');await page.getByRole('button',{name:'确认保存'}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(folders[1].name,'阅读笔记');
await page.getByRole('button',{name:'删除收藏夹',exact:true}).click();await page.getByRole('button',{name:'确认删除'}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(folderId,0);await page.getByRole('heading',{name:'收藏中的一篇文章',exact:true}).waitFor();
await page.getByRole('button',{name:'切换深色主题',exact:true}).click();await page.evaluate(async()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));await shots('folders-dark');
assert.deepEqual(errors,[]);console.log('PASS: phase-two notifications/read/preferences, history toggle/clear modal, folder create/move/rename/delete; 320/390/1280 and dark; mock API.');
}finally{await browser.close();await new Promise(r=>server.httpServer.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});

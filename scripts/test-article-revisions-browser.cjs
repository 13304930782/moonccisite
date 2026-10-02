const assert=require('node:assert/strict');const {chromium}=require('playwright');
(async()=>{const {preview}=await import('vite');const server=await preview({preview:{host:'127.0.0.1',port:4215,strictPort:true}});let browser;
try{browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
for(const width of [375,768,1440])for(const theme of ['light','dark']){
 const p=await browser.newPage({viewport:{width,height:950}});await p.addInitScript(t=>localStorage.setItem('mooncci-theme',t),theme);const errors=[];p.on('pageerror',e=>errors.push(e.message));
 let draft={id:'fixture',post_id:1,post_status:'published',version:1,base_version:1,payload:{title:'目前标题',content:'alpha\nnew line',slug:'fixture',summary:'',cover_image:'',category:'',tags:[]},updated_at:new Date().toISOString()},restoreCount=0;const saves=[];
 await p.route('**/api/**',async r=>{const u=new URL(r.request().url()),method=r.request().method();let data={};
 if(u.pathname==='/api/auth/me')data={user:{id:1,username:'Writer',role:'owner'}};
 else if(u.pathname.endsWith('/restore')){assert.equal(r.request().postDataJSON().version,draft.version);restoreCount++;draft={...draft,version:draft.version+1,payload:{...draft.payload,title:'历史标题',content:'alpha\nold line'}};data=draft;}
 else if(u.pathname.endsWith('/revisions/1'))data={id:1,payload:{...draft.payload,title:'历史标题',content:'alpha\nold line'}};
 else if(u.pathname.endsWith('/revisions'))data={items:[{id:1,kind:'publish',actor_name:'Writer',updated_at:new Date().toISOString()}],total:1};
 else if(u.pathname.startsWith('/api/article-drafts')){if(method==='PUT'){const input=r.request().postDataJSON();saves.push(input.save_kind);draft={...draft,version:draft.version+1,payload:input.payload};}data=draft;}
 await r.fulfill({json:data});});
 await p.goto('http://127.0.0.1:4215/admin/write');const title=p.getByRole('textbox',{name:'标题',exact:true});await title.fill('未保存的新标题');
 await p.getByRole('button',{name:'修订历史',exact:true}).click();await p.getByRole('button',{name:/发布版本 ·/}).click();await p.locator('.revision-compare').waitFor();assert.equal(await p.locator('.revision-added').count(),1);assert.equal(await p.locator('.revision-removed').count(),1);
 await p.locator('.revision-compare').scrollIntoViewIfNeeded();await p.screenshot({path:`.cache/revisions-compare-${width}-${theme}.png`,animations:'disabled'});
 const restore=p.getByRole('button',{name:'恢复为草稿',exact:true});await restore.focus();assert(await restore.evaluate(e=>e===document.activeElement));
 p.once('dialog',d=>d.accept());await restore.click();await p.waitForFunction(()=>document.body.textContent.includes('已恢复为草稿，尚未发布'));assert.equal(await title.inputValue(),'历史标题');assert.equal(restoreCount,1);assert(saves.includes('manual'));
 assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await p.screenshot({path:`.cache/revisions-${width}-${theme}.png`,animations:'disabled'});await p.close();
}console.log('PASS revision history, comparison, manual preservation and restore in 375/768/1440 light/dark');
}finally{await browser?.close();await server.httpServer.close();}})().catch(e=>{console.error(e);process.exitCode=1});

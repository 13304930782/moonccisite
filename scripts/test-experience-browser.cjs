const assert=require('node:assert/strict'),fs=require('fs');
const {chromium,webkit}=require('playwright');
(async()=>{
 const server=await(await import('vite')).createServer({server:{host:'127.0.0.1',port:4229,strictPort:true,hmr:false,watch:{ignored:['**/.cache/**','**/outputs/**']}}});await server.listen();
 const engine=process.env.QA_BROWSER==='webkit'?webkit:chromium;
 let browser;
 try{
 browser=await engine.launch({headless:true,...(engine===chromium?{channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const user={id:1,username:'mooncci',email:'reader@example.test',role:'owner',version:1};
 let failProfile=false;
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/api/**',async r=>{const p=new URL(r.request().url()).pathname;let json={};
 if(p==='/api/auth/me')json={user};
 else if(p==='/api/site-settings')json={brand:{},weather:{enabled:false}};
 else if(p==='/api/account'){if(r.request().method()!=='GET'&&failProfile)return r.fulfill({status:503,json:{message:'internal detail'}});json={user,message:'资料已保存'};}
 else if(p==='/api/auth/connections')json={providers:[]};
 else if(p.endsWith('/config'))json={enabled:true};
 else if(p==='/api/activity')json={items:[],total:0,page:1,pageSize:20};
 else if(p==='/api/auth/providers')json={providers:[]};
 await r.fulfill({json});});
 await page.goto('http://127.0.0.1:4229/account/settings');await page.getByRole('button',{name:'保存资料'}).waitFor({timeout:60000}).catch(async e=>{console.log(errors,await page.locator('body').innerText());await page.screenshot({path:'.cache/experience-failure.png'});throw e;});
 fs.mkdirSync('.cache/experience-qa',{recursive:true});
 await page.getByRole('button',{name:'保存资料'}).click();await page.locator('[data-feedback-toast]').waitFor();
 assert.equal(await page.locator('[data-feedback-toast]').count(),1);assert.equal(await page.getByRole('dialog').count(),0);
 await page.locator('[data-feedback-toast]').hover();await page.waitForTimeout(3300);assert.equal(await page.locator('[data-feedback-toast]').count(),1);
 await page.locator('[data-feedback-toast] button').focus();await page.mouse.move(1000,500);await page.waitForTimeout(3200);assert.equal(await page.locator('[data-feedback-toast]').count(),1);
 await page.getByRole('button',{name:'切换深色主题'}).click();assert.equal(await page.locator('html').getAttribute('data-moon-theme'),'dark');await page.waitForTimeout(450);assert.equal(await page.locator('[data-feedback-toast]').count(),0);
 // Invoke the same public helper used by real actions; exercise duplicate and queue limits.
 await page.evaluate(async()=>{const {notify}=await import('/src/app/lib/feedback.ts');notify.success('一');notify.success('一');notify.error('二');notify.success('三');});
 await page.waitForTimeout(450);assert.equal(await page.locator('[data-feedback-toast]').count(),2);
 assert.ok(await page.locator('[data-feedback-toast]').first().evaluate(el=>el.getBoundingClientRect().top >= document.querySelector('.account-topbar').getBoundingClientRect().bottom+8));assert.ok(await page.locator('[data-feedback-toast]').first().evaluate(el=>el.getBoundingClientRect().right>=innerWidth-40));await page.screenshot({path:'.cache/experience-qa/feedback-dark.png'});
 await page.mouse.click(1000,500);await page.waitForTimeout(450);assert.equal(await page.locator('[data-feedback-toast]').count(),0);
 failProfile=true;await page.getByRole('button',{name:'保存资料'}).click();await page.locator('[data-feedback-toast]').waitFor();await page.mouse.click(1000,500);await page.waitForTimeout(450);
 assert.ok(await page.getByText('尚未确认操作结果，请先刷新或查看记录，确认后再重试。',{exact:true}).count()>=1);
 await page.getByRole('button',{name:'保存资料'}).focus();
 await page.evaluate(async()=>{const {confirmAction}=await import('/src/app/lib/confirmAction.ts');window.confirmResult=undefined;void confirmAction('删除这条记录？').then(v=>window.confirmResult=v);});
 await page.getByRole('alertdialog').waitFor();assert.equal(await page.evaluate(()=>document.activeElement.textContent),'取消');
 await page.waitForTimeout(150);await page.keyboard.press('Escape');await page.getByRole('alertdialog').waitFor({state:'detached'});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.confirmResult),false);assert.equal(await page.evaluate(()=>document.activeElement.textContent),'保存资料');
 await page.goto('http://127.0.0.1:4229/updates');await page.getByRole('heading',{name:'最近更新'}).waitFor();assert.equal(await page.getByRole('navigation',{name:'分页'}).count(),0);
 await page.goto('http://127.0.0.1:4229/missing-experience');await page.getByRole('heading',{name:'这个页面没有找到'}).waitFor();assert.ok(page.url().endsWith('/missing-experience'));
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:950});await page.goto('http://127.0.0.1:4229/early-access');await page.getByRole('heading',{name:'一起打磨 PromptDock'}).waitFor();await page.waitForTimeout(300);const x=await page.locator('h1').evaluate(e=>e.getBoundingClientRect().x);await page.getByRole('combobox').first().click();assert.equal(await page.locator('h1').evaluate(e=>e.getBoundingClientRect().x),x);await page.keyboard.press('Escape');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`.cache/experience-qa/form-${width}.png`,fullPage:true});}
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:844});await page.evaluate(async()=>{const {notify}=await import('/src/app/lib/feedback.ts');notify.success('设置已保存');});await page.screenshot({path:'.cache/experience-qa/feedback-mobile.png'});await page.mouse.move(380,600);await page.waitForTimeout(3500);assert.equal(await page.locator('[data-feedback-toast]').count(),0);
 await page.evaluate(async()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));const {notify}=await import('/src/app/lib/feedback.ts');notify.error('保留六秒的失败提示');});
 await page.waitForTimeout(6500);assert.equal(await page.locator('[data-feedback-toast]').count(),1);
 await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))});await page.waitForTimeout(3300);assert.equal(await page.locator('[data-feedback-toast]').count(),1);await page.waitForTimeout(3100);assert.equal(await page.locator('[data-feedback-toast]').count(),0);
 await page.goto('http://127.0.0.1:4229/early-access');await page.getByRole('button',{name:'提交申请'}).click();await page.locator('.experience-field-error').first().waitFor();
 const name=page.locator('input[autocomplete="name"]');await name.fill('访客');assert.notEqual(await name.getAttribute('aria-invalid'),'true');
 await page.screenshot({path:'.cache/experience-qa/field-errors.png',fullPage:true});
 fs.writeFileSync('.cache/experience-qa/result-'+(process.env.QA_BROWSER||process.env.PLAYWRIGHT_CHANNEL||'edge')+'.json',JSON.stringify({passed:true,browser:await browser.version(),toastPosition:'top-right',widths:[320,390,768,1440],date:new Date().toISOString()},null,2));
 assert.deepEqual(errors,[]);console.log('PASS: real save/error, auto-dismiss, hover/focus pause, outside click delivery, dedupe/limit, cancel default and focus restoration, pagination, 404, 4 widths, select stability, reduced motion.');
 }finally{await browser?.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

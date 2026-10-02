const assert=require('node:assert/strict'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{const server=await(await import('vite')).preview({preview:{host:'127.0.0.1',port:4204,strictPort:true}}),browser=await chromium.launch({channel:'msedge',headless:true});try{
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];let verified=false,sendFail=true,confirmFail=true,category='';
page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.route('**/api/**',async route=>{const q=route.request(),u=new URL(q.url()),p=u.pathname;let body={};
if(p==='/api/auth/me')body={user:{id:1,username:'mooncci',role:'owner'}};
else if(p==='/api/engagement/config'||p==='/api/publishing/config')body={enabled:true};
else if(p==='/api/engagement/preferences')body={email_verified:verified,comment_email:false,reply_email:false};
else if(p==='/api/engagement/notifications'){category=u.searchParams.get('kind');body={items:[],unread:0};}
else if(p==='/api/engagement/notifications/unread')body={unread:0};
else if(p==='/api/engagement/verify-email'){if(sendFail){sendFail=false;return route.fulfill({status:503,json:{message:'邮件服务暂时不可用，请重试。'}});}body={ok:true};}
else if(p==='/api/engagement/verify-email/confirm'){if(confirmFail){confirmFail=false;return route.fulfill({status:400,json:{message:'验证码不正确，请重新输入。'}});}verified=true;body={ok:true};}
else if(p==='/api/site-settings')body={brand:{},weather:{enabled:false}};
await route.fulfill({json:body});});
fs.mkdirSync('.cache/layout-interactions',{recursive:true});
await page.goto('http://127.0.0.1:4204/account/notifications');await page.getByRole('button',{name:'验证邮箱',exact:true}).waitFor();
assert.equal(await page.getByText('上一页',{exact:true}).count(),0);
for(const mode of ['desktop','dark','mobile']){
await page.setViewportSize({width:mode==='mobile'?390:1440,height:1000});await page.evaluate(t=>{localStorage.setItem('mooncci-theme',t)},mode==='dark'?'dark':'light');await page.reload();await page.getByRole('combobox',{name:'消息分类'}).click();
await page.getByRole('option',{name:'文章评论',exact:true}).waitFor();await page.evaluate(async()=>{await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));});await page.screenshot({animations:'disabled',path:'.cache/layout-interactions/dropdown-'+mode+'.png'});
await page.getByRole('option',{name:'文章评论',exact:true}).click();await page.waitForTimeout(100);assert.equal(category,'comment');
await page.getByRole('combobox',{name:'消息分类'}).click();await page.getByRole('option',{name:'全部通知',exact:true}).click();await page.waitForTimeout(100);assert.equal(category,'');
await page.getByRole('button',{name:'验证邮箱',exact:true}).click();const dialog=page.getByRole('dialog',{name:'验证通知邮箱'});await dialog.waitFor();
if(mode==='desktop'){await dialog.getByRole('button',{name:'发送邮箱验证码'}).click();await dialog.getByRole('alert').waitFor();assert.match(await dialog.textContent(),/尚未确认操作结果/);}
await dialog.getByRole('button',{name:'发送邮箱验证码'}).click();await dialog.getByLabel('邮箱验证码').waitFor();await dialog.getByLabel('邮箱验证码').fill('123456');assert.equal(await dialog.getByRole('button',{name:/秒后可重发/}).isDisabled(),true);
if(mode==='desktop'){await dialog.getByRole('button',{name:'确认验证'}).click();await dialog.getByRole('alert').waitFor();assert.match(await dialog.textContent(),/验证码不正确/);}
await page.evaluate(async()=>{await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));});await page.screenshot({animations:'disabled',path:'.cache/layout-interactions/verify-'+mode+'.png'});for(let n=0;n<5;n++){await page.keyboard.press('Tab');assert.equal(await dialog.evaluate(el=>el.contains(document.activeElement)),true);}
assert.ok(await dialog.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}));
if(mode==='mobile'){await dialog.getByRole('button',{name:'确认验证'}).click();await dialog.waitFor({state:'hidden'});assert.equal(await page.getByRole('checkbox',{name:/新评论邮件/}).isEnabled(),true);}
else await page.keyboard.press('Escape');
}
assert.deepEqual(errors,[]);console.log('PASS: themed dropdowns light/dark/mobile; empty option restored; verification send failure/retry, invalid code, cooldown, focus trap, mobile bounds and successful verification. Mock mail only.');
}finally{await browser.close();await new Promise(r=>server.httpServer.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
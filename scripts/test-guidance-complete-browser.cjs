const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('fs');
(async()=>{const server=await(await import('vite')).preview({preview:{host:'127.0.0.1',port:4208,strictPort:true}}),browser=await chromium.launch({channel:'msedge',headless:true});try{
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];let role='owner',bound=true,changeFail=true,resetBody,slugBody,seriesSaved=false,codeSends=0,retries=0,failed=true;
page.on('pageerror',e=>errors.push(e.message));fs.mkdirSync('.cache/guidance-complete-qa',{recursive:true});
const profile=()=>({id:1,username:'mooncci',email:'reader@example.test',role,status:'active',can_comment:1,version:1});
await page.route('**/api/**',async route=>{const q=route.request(),u=new URL(q.url()),p=u.pathname;let data={};
if(p==='/api/auth/me')data={user:role?profile():null};
else if(p.endsWith('/config')||p==='/api/account/security-config')data={enabled:true};
else if(p==='/api/site-settings')data={brand:{},weather:{enabled:false}};
else if(p==='/api/account')data={user:profile()};
else if(p==='/api/auth/connections')data={providers:[{provider:'github',name:'GitHub',enabled:true,bound}]};
else if(p==='/api/account/security-code'){codeSends++;data={challenge_id:'proof'};}
else if(p==='/api/account/connections/github'){if(changeFail){changeFail=false;return route.fulfill({status:503,json:{message:'暂时无法解绑，请重试'}});}bound=false;data={message:'GitHub 已解绑。'};}
else if(p==='/api/account/password-reset')data={message:'邮件已发送。'};
else if(p==='/api/auth/providers')data={providers:[]};
else if(p==='/api/auth/reset-password'){resetBody=q.postDataJSON();data={message:'密码已重置。'};}
else if(p==='/api/bookmark-folders')data={items:[{id:0,name:'默认收藏夹',total:0}]};
else if(p==='/api/bookmarks'||p==='/api/posts'||p==='/api/admin/users'||p==='/api/admin/comments'||p==='/api/admin/early-access'||p==='/api/admin/subscribers')data={items:[],total:0,page:1,pageSize:20};
else if(p==='/api/series'&&q.method()==='POST'){slugBody=q.postDataJSON();seriesSaved=true;data={id:2,slug:'series-fixture'};}
else if(p==='/api/series')data={items:seriesSaved?[{id:2,title:'中文专栏',slug:'series-fixture',article_count:0}]:[]};
else if(p==='/api/series/missing')return route.fulfill({status:404,json:{message:'专栏不存在。'}});
else if(p==='/api/upload/media')data={items:[{filename:'cover.png',url:'/api/uploads/cover.png',display_name:'封面图片'}],total:1};
else if(p==='/api/uploads/cover.png')return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5lQAAAAASUVORK5CYII=','base64')});
else if(p==='/api/admin/early-access/999')return route.fulfill({status:404,json:{message:'申请不存在。'}});
else if(p==='/api/admin/newsletter')data={enabled:false,deliveryConfigured:false,counts:[],deliveries:{items:[],total:0,page:1,pageSize:20}};
else if(p==='/api/admin/newsletter/preview')data={items:[],empty:true,period:{start:'2026-09-01',end:'2026-09-07'}};
else if(p==='/api/admin/operations')data={start:'2026-09-01',end:'2026-09-22',partial:false,summary:{pending:0,scheduled:0,failed:0,mailFailed:failed?1:0,views:0,comments:0,bookmarks:0},trend:[],articles:[],tasks:[]};
else if(p==='/api/admin/operations/mail-failures')data={items:failed?[{id:3,attempts:5,reason:'邮件发送失败；现有记录未保留更细的原因。'}]:[]};
else if(p.endsWith('/mail-failures/3/retry')){retries++;failed=false;data={message:'已重新排队，等待任务进程处理。'};}
await route.fulfill({json:data});});
for(const mode of ['desktop','mobile','dark']){
await page.setViewportSize({width:mode==='mobile'?390:1440,height:1000});await page.goto('http://127.0.0.1:4208/account/settings');if(mode==='dark')await page.getByRole('button',{name:'切换深色主题'}).click();
await page.getByRole('button',{name:'换绑 GitHub'}).click();await page.getByRole('dialog').getByLabel('邮箱验证码').waitFor();assert.ok(await page.getByRole('button',{name:'验证并前往授权'}).isDisabled());await page.getByRole('dialog').getByLabel('邮箱验证码').fill('123456');
for(let i=0;i<4;i++){await page.keyboard.press('Tab');assert.ok(await page.getByRole('dialog').evaluate(el=>el.contains(document.activeElement)));}
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.waitForTimeout(350);await page.screenshot({animations:'disabled',path:'.cache/guidance-complete-qa/change-'+mode+'.png'});await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
}
await page.goto('http://127.0.0.1:4208/account/settings');await page.getByRole('button',{name:'解绑 GitHub'}).click();await page.getByLabel('邮箱验证码',{exact:true}).fill('123456');await page.getByRole('button',{name:'验证并确认解绑'}).click();await page.getByRole('dialog').getByRole('alert').waitFor();assert.equal(bound,true);assert.equal(await page.getByLabel('邮箱验证码',{exact:true}).inputValue(),'123456');await page.getByRole('button',{name:'验证并确认解绑'}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(bound,false);
await page.getByRole('button',{name:'发送密码重置链接'}).click();await page.locator('.account-section').filter({has:page.getByRole('heading',{name:'密码',exact:true})}).getByRole('status').waitFor();
role='user';await page.goto('http://127.0.0.1:4208/admin/users');await page.getByRole('heading',{name:'当前账号无法访问此页面'}).waitFor();assert.match(await page.getByRole('link',{name:'去我的投稿'}).getAttribute('href'),/submissions/);assert.ok(page.url().endsWith('/admin/users'));
role='';await page.goto('http://127.0.0.1:4208/reset-password?redirect=%2Faccount%2Fsubmissions#token=fixture-secret');await page.getByLabel('新密码',{exact:true}).fill('Password123');assert.ok(!page.url().includes('fixture-secret'));await page.getByLabel('确认新密码',{exact:true}).fill('Password123');await page.getByRole('button',{name:'重置密码',exact:true}).click();assert.equal(resetBody.token,'fixture-secret');assert.equal(new URL(await page.getByRole('link',{name:'使用新密码登录'}).getAttribute('href'),'https://site.test').searchParams.get('redirect'),'/account/submissions');
role='owner';await page.goto('http://127.0.0.1:4208/admin/series');await page.getByRole('button',{name:'新建专栏'}).click();await page.getByLabel('名称',{exact:true}).fill('中文专栏');await page.getByRole('button',{name:'从媒体库选择封面'}).click();await page.getByRole('button',{name:'封面图片'}).click();await page.getByRole('button',{name:'使用图片'}).click();await page.getByRole('button',{name:'保存专栏',exact:true}).click();await page.getByText(/专栏已保存/).waitFor();assert.equal(slugBody.slug,'');assert.equal(slugBody.cover_image,'/api/uploads/cover.png');
await page.goto('http://127.0.0.1:4208/search?q=missing');await page.getByRole('button',{name:'清除搜索，重新查找'}).click();assert.ok(!page.url().includes('q='));
await page.goto('http://127.0.0.1:4208/account/bookmarks');await page.getByRole('searchbox').fill('missing');await page.getByRole('button',{name:'清除筛选，查看全部收藏'}).click();assert.equal(await page.getByRole('searchbox').inputValue(),'');
await page.goto('http://127.0.0.1:4208/series/missing');await page.getByRole('link',{name:'返回内容列表'}).waitFor();assert.equal(await page.getByRole('button',{name:'重试',exact:true}).count(),0);
await page.goto('http://127.0.0.1:4208/admin/early-access/999');await page.getByRole('link',{name:'返回申请列表'}).waitFor();
await page.goto('http://127.0.0.1:4208/admin/newsletter');await page.getByRole('button',{name:'已完成配置，重新检查'}).waitFor();assert.ok(await page.getByRole('button',{name:'开启周报',exact:true}).isDisabled());
await page.goto('http://127.0.0.1:4208/admin/operations');await page.getByRole('button',{name:'查看失败任务'}).click();await page.getByRole('button',{name:'重试此任务'}).click();assert.equal(retries,0);await page.getByRole('button',{name:'确认重新排队'}).click();await page.getByText('已重新排队，等待任务进程处理。').waitFor();assert.equal(retries,1);
assert.deepEqual(errors,[]);console.log('PASS: 8 guidance groups, account dialog/mobile/dark/focus/error retention; permissions; fragment reset continuation; automatic series/cover; empty recovery; missing detail exits; newsletter prerequisite; explicit retry. Mock APIs only.');
}finally{await browser.close();await new Promise(r=>server.httpServer.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});

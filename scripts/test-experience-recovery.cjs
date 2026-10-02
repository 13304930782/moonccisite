const assert=require('node:assert/strict'),fs=require('fs'),{chromium}=require('playwright');
(async()=>{const server=await(await import('vite')).preview({build:{outDir:process.env.QA_DIST||'dist'},preview:{port:4236,strictPort:true,host:'127.0.0.1'}}),browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));let signed=false,failComment=true,activityFail=false;const user={id:1,username:'读者',role:'user',can_comment:1};
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/api/**',async r=>{const u=new URL(r.request().url()),p=u.pathname;let json={};
 if(p==='/api/auth/me')json={user:signed?user:null};
 else if(p==='/api/auth/login'){signed=true;json={user};}
 else if(p==='/api/site-settings')json={brand:{},weather:{enabled:false}};
 else if(p==='/api/auth/providers')json={providers:[]};
 else if(p==='/api/updates/1')json={id:1,title:'登录方式更新',content:'QQ 与 Google 登录已开放。',author_name:'mooncci',published_at:'2026-09-10'};
 else if(p==='/api/activity'){if(activityFail)return r.fulfill({status:503,json:{message:'test'}});json={items:[{id:1,activity_id:'u1',type:'update',path:'/updates/1',excerpt:'一条内容较长的近况。'.repeat(50),published_at:'2026-09-10'}],total:1,page:1,pageSize:20};}
 else if(p.startsWith('/api/comments/')){if(r.request().method()==='POST'){if(failComment)return r.fulfill({status:503,json:{message:'test'}});json={message:'评论已提交，等待审核'};}else json=Array.from({length:60},(_,i)=>({id:i+1,user_id:2,content:'用于检查大量评论的阅读体验。'.repeat(8),author_name:'读者'+i,status:'visible',created_at:'2026-09-10',parent_id:null}));}
 await r.fulfill({json});});
 const base='http://127.0.0.1:4236';fs.mkdirSync('.cache/experience-recovery',{recursive:true});
 await page.goto(base+'/updates');await page.getByRole('button',{name:'展开讨论',exact:true}).click();await page.getByRole('link',{name:'登录参与 ↗'}).click();await page.locator('#email').fill('reader@example.test');await page.locator('#password').fill('example-password');await page.locator('form.auth-form').evaluate(f=>f.requestSubmit());await page.getByRole('heading',{name:'登录方式更新'}).waitFor();assert.ok(page.url().includes('/updates/1'));
 const comment=page.locator('textarea').first();await comment.fill('保留这段未成功提交的评论');await page.getByRole('button',{name:'发表评论',exact:true}).click();await page.getByText('尚未确认操作结果，请先刷新或查看记录，确认后再重试。').first().waitFor();assert.equal(await comment.inputValue(),'保留这段未成功提交的评论');await page.mouse.click(10,500);assert.equal(await comment.inputValue(),'保留这段未成功提交的评论');failComment=false;await page.getByRole('button',{name:'发表评论',exact:true}).click();await page.waitForFunction(()=>document.querySelector('textarea').value==='');
 await page.goto(base+'/updates');await page.getByRole('button',{name:'展开讨论',exact:true}).click();const list=page.getByRole('region',{name:'近况评论列表'});await list.waitFor();assert.ok((await list.boundingBox()).height<700);await page.getByRole('button',{name:'收起讨论',exact:true}).click();assert.equal(await list.count(),0);
 activityFail=true;await page.getByRole('link',{name:'查看近况'}).click();await page.goBack();await page.getByText('保留上次加载的内容，你可以稍后重试。',{exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'查看近况'}).count(),1);
 await page.setViewportSize({width:720,height:500});await page.screenshot({path:'.cache/experience-recovery/zoom-equivalent.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);console.log('PASS: reading/login/comment return, failed submit preserves input, manual retry, 60 comments collapse, refresh failure retains content, 200% equivalent viewport.');
}finally{await browser.close();await new Promise(r=>server.httpServer.close(r))}})().catch(e=>{console.error(e);process.exitCode=1});

const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('fs');
(async()=>{const server=await(await import('vite')).preview({preview:{host:'127.0.0.1',port:4206,strictPort:true}}),browser=await chromium.launch({channel:'msedge',headless:true});
try{
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];let fail=false,loggedIn=true,lastQuery='',items=[{id:'a',browser:'Chrome',os:'Windows',current:true,first_seen:Date.now()-86400000,last_seen:Date.now(),expires_at:Date.now()+86400000,legacy:0},{id:'b',browser:'Safari',os:'iOS / iPadOS',current:false,first_seen:Date.now()-86400000,last_seen:Date.now()-400000,expires_at:Date.now()+86400000,legacy:1}];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/**',async route=>{const q=route.request(),u=new URL(q.url()),p=u.pathname;let data={};
if(p==='/api/auth/session')data={user:loggedIn?{id:1,role:'owner',username:'mooncci'}:null};
else if(p.endsWith('/config')||p==='/api/account/security-config')data={enabled:true};
else if(p==='/api/site-settings')data={brand:{},weather:{enabled:false}};
else if(p==='/api/account/sessions'&&q.method()==='GET')data={items};
else if(p==='/api/account/sessions/revoke-others'){items=items.filter(x=>x.current);data={ok:true};}
else if(p.startsWith('/api/account/sessions/')){if(fail){fail=false;return route.fulfill({status:503,json:{message:'暂时无法退出，请重试。'}});}const id=p.split('/').pop(),current=items.find(x=>x.id===id)?.current;items=items.filter(x=>x.id!==id);if(current)loggedIn=false;data={current,ok:true};}
else if(p==='/api/admin/operations'){lastQuery=u.search;data={start:'2026-09-01',end:'2026-09-22',partial:true,summary:{pending:3,scheduled:2,failed:1,mailFailed:1,views:1384,comments:16,bookmarks:42},trend:Array.from({length:30},(_,i)=>({day:'2026-09-'+String(i+1).padStart(2,'0'),views:i<3?null:Math.round(50+30*Math.sin(i))})),articles:[{id:1,title:'把路上的风景写下来',views:862,comments:11,bookmarks:28},{id:2,title:'在日常里找回写作的节奏',views:522,comments:5,bookmarks:14}],tasks:[{draft_id:'x',state:'failed',title:'夏末的城市散步',reason:'作者账号已停用'},{draft_id:'y',state:'submitted',title:'给下一次旅行留一点空白'}]};}
await route.fulfill({json:data});});
fs.mkdirSync('.cache/operations-qa',{recursive:true});
for(const mode of ['desktop','mobile','narrow','dark']){
await page.setViewportSize({width:mode==='mobile'?390:mode==='narrow'?320:1440,height:1000});await page.goto('http://127.0.0.1:4206/account/sessions');if(mode==='dark'){await page.getByRole('button',{name:'切换深色主题'}).click();}
await page.getByRole('heading',{name:'Chrome · Windows'}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await page.screenshot({path:'.cache/operations-qa/sessions-'+mode+'.png',fullPage:true,animations:'disabled'});
await page.getByRole('button',{name:'退出 Safari iOS / iPadOS',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();
for(let n=0;n<4;n++){await page.keyboard.press('Tab');assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)));}
await page.screenshot({path:'.cache/operations-qa/confirm-'+mode+'.png',animations:'disabled'});await page.keyboard.press('Escape');
await page.goto('http://127.0.0.1:4206/admin/operations');await page.getByRole('heading',{name:'运营概览',exact:true}).waitFor();await page.getByText('1,384',{exact:true}).count();await page.waitForSelector('.operations-metrics');
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await page.screenshot({path:'.cache/operations-qa/operations-'+mode+'.png',fullPage:true,animations:'disabled'});
await page.getByRole('button',{name:'近 7 天',exact:true}).click();await page.waitForTimeout(100);assert.match(lastQuery,/days=7/);
await page.getByLabel('开始日期').fill('2026-09-01');await page.getByLabel('结束日期').fill('2026-09-07');await page.getByRole('button',{name:'应用日期'}).click();await page.waitForTimeout(100);assert.match(lastQuery,/from=2026-09-01/);
await page.locator('.admin-main').evaluate(el=>el.scrollTo(0,el.scrollHeight));await page.screenshot({path:'.cache/operations-qa/operations-bottom-'+mode+'.png',animations:'disabled'});await page.getByText('查看每日阅读数据',{exact:true}).click();await page.getByText('未采集',{exact:true}).first().waitFor();
assert.match(await page.getByRole('link',{name:/发布失败.*查看并处理/}).getAttribute('href'),/state=failed/);
}
await page.goto('http://127.0.0.1:4206/account/sessions');await page.getByRole('button',{name:'退出 Safari iOS / iPadOS'}).click();fail=true;await page.getByRole('button',{name:'确认退出'}).click();await page.getByRole('dialog').getByRole('alert').waitFor();assert.equal(items.length,2);await page.getByRole('button',{name:'确认退出'}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(items.length,1);
await page.getByRole('button',{name:'退出其他会话',exact:true}).click();await page.getByRole('button',{name:'确认退出'}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
await page.getByRole('button',{name:'退出 Chrome Windows 当前会话'}).click();await page.getByRole('button',{name:'确认退出'}).click();await page.waitForURL('**/login');assert.equal(loggedIn,false);
assert.deepEqual(errors,[]);console.log('PASS: sessions list, confirm/focus/escape, failed revoke retry, revoke others/current redirect; operations ranges, metric labels/missing data and task links; 320/390/1440 + dark, mock API.');
}finally{await browser.close();await new Promise(r=>server.httpServer.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
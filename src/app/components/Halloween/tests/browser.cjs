// Run against isolated fixture servers: baseline 5340, candidate 5341.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {defaults,evaluate}=require('../../../../../server/src/lib/festivals');
const base=process.env.BASELINE_URL||'http://127.0.0.1:5340',candidate=process.env.CANDIDATE_URL||'http://127.0.0.1:5341';
const out=path.resolve(process.env.HALLOWEEN_EVIDENCE_DIR||'.cache/halloween-acceptance');fs.mkdirSync(out,{recursive:true});
const routes=[['home','/'],['articles','/articles'],['article','/article/ai-summary-short'],['note','/updates/901'],['updates','/updates'],['projects','/projects'],['search','/search?q=Mod'],['electricity','/electricity'],['admin','/admin'],['admin-posts','/admin/posts'],['admin-write','/admin/write?draft=a1111111-1111-4111-8111-111111111111'],['admin-newsletter','/admin/newsletter'],['admin-users','/admin/users']];
const report={comparisons:[],screenshots:[],interactions:[]};
let browser;
async function open(origin,route,width,theme,date,off=false,reduced=true){
 const context=await browser.newContext({viewport:{width,height:1000},colorScheme:theme,reducedMotion:reduced?'reduce':'no-preference',timezoneId:'America/Los_Angeles'});
 await context.addInitScript(({theme,date,off,reduced})=>{
  try{localStorage.setItem('mooncci-theme',theme);if(off)localStorage.setItem('mooncci-halloween','off');}catch{}
  const Original=Date;window.Date=class extends Original{constructor(...args){super(...(args.length?args:[date]));}static now(){return new Original(date).getTime();}};
  Math.random=()=>0.42;if(reduced)Object.defineProperty(performance,'now',{value:()=>1000});
 },{theme,date,off,reduced});
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 const page=await context.newPage(),requests=[],errors=[];
 await page.route('**/api/settings/festivals/active',async r=>r.fulfill({json:evaluate(defaults(),await page.evaluate(()=>Date.now()))}));
 page.on('request',r=>requests.push(new URL(r.url()).pathname));page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/electricity/rss/subscription**',r=>r.fulfill({json:{data:{url:'https://mooncci.test/api/electricity/rss/feed.xml?token=local-fixture-token',resetRequired:false}}}));
 await page.route('**/api/weather-mood**',r=>r.fulfill({json:{data:{status:'unavailable',date:date.slice(0,10),city:null,timezone:'Asia/Shanghai',weather:null,mood:null,refreshAt:'2028-01-01T00:00:00Z',mode:'manual'}}}));
 await page.goto(origin+route);await page.waitForTimeout(1100);
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>{i.loading='eager';return i.decode().catch(()=>{});}));window.scrollTo(0,document.body.scrollHeight);});
 await page.waitForLoadState('networkidle');
 await page.evaluate(async()=>{await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));window.scrollTo(0,0);});
 await page.waitForTimeout(300);
 return {context,page,requests,errors};
}
async function shot(page,name){const file=path.join(out,name+'.png');await page.screenshot({path:file,fullPage:true,animations:'disabled',caret:'hide'});return file;}
async function pixels(page,a,b){return page.evaluate(async({a,b})=>{
 const read=async src=>{const i=new Image();i.src=src;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);return {w:i.width,h:i.height,p:x.getImageData(0,0,i.width,i.height).data};};
 const x=await read(a),y=await read(b);if(x.w!==y.w||x.h!==y.h)return {dimensions:[x.w,x.h,y.w,y.h]};let n=0;for(let i=0;i<x.p.length;i+=4)if(x.p[i]!==y.p[i]||x.p[i+1]!==y.p[i+1]||x.p[i+2]!==y.p[i+2]||x.p[i+3]!==y.p[i+3])n++;return n;
 },{a:'data:image/png;base64,'+fs.readFileSync(a).toString('base64'),b:'data:image/png;base64,'+fs.readFileSync(b).toString('base64')});}
async function compare(mode,name,route,width,theme){
 const date=mode==='outside'?'2026-11-05T04:00:00Z':'2026-10-28T04:00:00Z';
 const before=await open(base,route,width,theme,date),after=await open(candidate,route,width,theme,date,mode==='off');
 try{
  if(mode==='outside'){assert.equal(await after.page.locator('html.halloween').count(),0);assert.equal(after.requests.filter(p=>/(?:Halloween|Decorations)[^/]*\.js$/i.test(p)).length,0);}
  if(mode==='on')assert.equal(await after.page.locator('html.halloween').count(),1);
  if(mode==='off'){assert.equal(await after.page.locator('html.halloween').count(),0);assert.equal(after.requests.filter(p=>/(?:Halloween|Decorations)[^/]*\.js$/i.test(p)).length,0);}
  if(mode!=='outside')await after.page.evaluate(()=>document.querySelectorAll('[data-halloween="logo"],[data-halloween="hat"],[data-halloween="hat-front"],[data-halloween="footer"]').forEach(e=>e.remove()));
  const prefix=[mode,name,width,theme].join('-');
  const a=await shot(before.page,prefix+'-baseline'),b=await shot(after.page,prefix+'-candidate');
  const scripts=t=>new Set(t.requests.filter(p=>p.endsWith('.js'))).size;
  const scriptRequestDelta=scripts(after)-scripts(before);
  const diffPixels=await pixels(after.page,a,b);const row={mode,name,route,width,theme,diffPixels,scriptRequestDelta,errors:after.errors};report.comparisons.push(row);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(row));
 }finally{await before.context.close();await after.context.close();}
}
async function interactions(width,theme){
 const t=await open(candidate,'/',width,theme,'2026-10-28T04:00:00Z');
 try{
  const p=t.page;assert.equal(await p.locator('html.halloween').count(),1);
  assert.equal(await p.locator('.hw-moon').evaluate(e=>getComputedStyle(e).opacity),'1');
  if(theme==='dark')assert.ok(await p.locator('.hw-moon').evaluate(e=>e.getBoundingClientRect().top+parseFloat(getComputedStyle(e,':before').top)>=document.querySelector('.site-header').getBoundingClientRect().bottom),'Full halo must clear the header');
  assert.ok(await p.locator('.hw-moon').evaluate(e=>e.getBoundingClientRect().top>=document.querySelector('.site-header').getBoundingClientRect().bottom),'Moon must clear the header');
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const capsule=p.getByRole('button',{name:'万圣节快乐，点击撒糖'});assert.equal(await capsule.count(),1);
  const box=await capsule.boundingBox();assert.ok(box.height>=44);
  await p.screenshot({path:path.join(out,`home-on-${width}-${theme}.png`),fullPage:true,animations:'disabled'});
  report.screenshots.push(`home-on-${width}-${theme}.png`);
  assert.equal(await p.locator('filter#hw-felt feTurbulence').count(),1);
  assert.equal(await p.locator('filter#hw-felt feComposite').getAttribute('in2'),'SourceGraphic');
  assert.equal(await p.locator('[data-halloween=hat-front]').getAttribute('filter'),'url(#hw-felt)');
  const pet=await p.locator('.weather-companion-mount').boundingBox();assert.ok(pet);
  await p.screenshot({path:path.join(out,`hat-${width}-${theme}.png`),clip:{x:Math.max(0,pet.x-22),y:Math.max(0,pet.y-90),width:Math.min(120,width-Math.max(0,pet.x-22)),height:180},animations:'disabled'});
  await capsule.click();await p.getByText('糖果送到啦',{exact:true}).waitFor();assert.equal(await p.locator('canvas').count(),0);
  const favicon=await p.locator('link[rel="icon"]').first().getAttribute('href');assert.ok(favicon.startsWith('data:image/svg+xml'));
  fs.writeFileSync(path.join(out,'favicon.svg'),decodeURIComponent(favicon.split(',').slice(1).join(',')));
  await p.evaluate(()=>document.querySelector('link[rel="icon"]').setAttribute('href','/qa-mod.svg'));
  await p.waitForTimeout(50);assert.equal(await p.locator('link[rel="icon"]').first().getAttribute('href'),favicon);
  await p.getByRole('button',{name:'关闭节日装饰',exact:true}).click();
  assert.equal(await p.locator('html.halloween').count(),0);assert.equal(await p.evaluate(()=>localStorage.getItem('mooncci-halloween')),'off');assert.equal(await capsule.count(),0);
  assert.equal(await p.locator('link[rel="icon"]').first().getAttribute('href'),'/qa-mod.svg');
  await p.getByRole('button',{name:'开启节日装饰',exact:true}).click();assert.equal(await p.locator('html.halloween').count(),1);
  report.interactions.push({width,theme,toggle:true,reducedMotion:true,noHorizontalOverflow:true});
 }finally{await t.context.close();}
}
async function motion(){
 const t=await open(candidate,'/',1440,'light','2026-10-28T04:00:00Z',false,false);
 try{const p=t.page;await p.locator('.hw-scene[data-moving="true"]').waitFor();
  await p.locator('[data-halloween="hat"]').waitFor();
  const transform=await p.locator('[data-halloween="hat"]').evaluate(h=>h.parentElement.getAttribute('transform'));
  await p.evaluate(()=>{const hat=document.querySelector('[data-halloween="hat"]');window.qaHatBody=hat.parentElement;const fake=document.createElementNS('http://www.w3.org/2000/svg','g');fake.id='qa-fx-back';fake.setAttribute('pointer-events','none');fake.append(document.createElementNS('http://www.w3.org/2000/svg','path'));hat.parentElement.parentElement.prepend(fake);});
  await p.waitForTimeout(100);assert.equal(await p.locator('[data-halloween="hat"]').evaluate(h=>h.parentElement===window.qaHatBody),true);
  await p.evaluate(()=>document.querySelector('#qa-fx-back').remove());
  await p.waitForTimeout(1200);assert.notEqual(await p.locator('[data-halloween="hat"]').evaluate(h=>h.parentElement.getAttribute('transform')),transform);
  await p.evaluate(async()=>{
    const hat=document.querySelector('[data-halloween="hat"]'),eyes=[...hat.parentElement.querySelectorAll(':scope > path')].slice(1,3);
    if(hat!==hat.parentElement.firstElementChild)throw Error('Head must occlude the rear brim so eyes stay on the ball');
    const front=hat.parentElement.querySelector('[data-halloween=hat-front]');
    const forward=front.innerHTML;
    hat.parentElement.setAttribute('data-head-pitch','-.45');
    await Promise.resolve();
    if(front.innerHTML===forward)throw Error('Looking up must project the whole hat');
    hat.parentElement.setAttribute('data-head-pitch','.45');
    await Promise.resolve();
    if(/NaN|Infinity/.test(front.innerHTML))throw Error('Invalid projected geometry');
    const before=hat.getAttribute('transform');
    eyes.forEach(e=>e.setAttribute('transform','translate(240 70) scale(1 .02)'));
    await Promise.resolve();
    if(hat.getAttribute('transform')!==before)throw Error('Blink must not deform the rear hat');
  });
  await p.emulateMedia({reducedMotion:'reduce'});await p.waitForTimeout(200);
  assert.equal(await p.locator('[data-halloween="hat"]').count(),1);
  assert.equal(await p.locator('[data-halloween="hat"]').getAttribute('transform'),null);
  await p.emulateMedia({reducedMotion:'no-preference'});await p.waitForTimeout(200);
  await p.getByRole('button',{name:'万圣节快乐，点击撒糖'}).click();await p.locator('canvas').waitFor();await p.waitForTimeout(350);
  await p.screenshot({path:path.join(out,'candy-confetti.png')});
  await p.evaluate(()=>{document.documentElement.dataset.reducedMotion='true';dispatchEvent(new Event('mooncci:motion-change'));});
  await p.locator('.hw-scene[data-moving="false"]').waitFor();await p.waitForTimeout(100);
  await p.getByRole('button',{name:'万圣节快乐，点击撒糖'}).click();await p.getByText('糖果送到啦',{exact:true}).waitFor();
  assert.equal(await p.locator('canvas').count(),0);
  await p.evaluate(()=>{document.documentElement.dataset.reducedMotion='false';dispatchEvent(new Event('mooncci:motion-change'));window.scrollTo(0,document.body.scrollHeight);});
  await p.locator('.hw-scene[data-moving="false"]').waitFor();
  await p.evaluate(()=>{Date.now=()=>new Date('2026-11-02T00:00:00+08:00').getTime();document.dispatchEvent(new Event('visibilitychange'));});
  await p.waitForTimeout(100);assert.equal(await p.locator('html.halloween').count(),0);assert.equal(await p.locator('[data-halloween="footer"]').count(),0);
  report.interactions.push({normalConfetti:true,readingPreferenceEvent:true,offscreenPaused:true,liveExpiry:true,hatFollowsAnimatedBody:true,hatIgnoresFxBack:true});
 }finally{await t.context.close();}
}
(async()=>{
 browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  if(process.env.QA_MOTION_ONLY){await motion();}
  else if(process.env.QA_RETRY){
   const previous=JSON.parse(fs.readFileSync(path.join(out,'report.json'),'utf8'));
   fs.writeFileSync(path.join(out,'parallel-report.json'),JSON.stringify(previous,null,2));
   report.comparisons=previous.comparisons.filter(r=>r.diffPixels===0);report.interactions=previous.interactions;report.screenshots=previous.screenshots;
   for(const r of previous.comparisons.filter(r=>r.diffPixels!==0))await compare(r.mode,r.name,r.route,r.width,r.theme);
  }else if(process.env.QA_PRESENTATION){
   const previous=JSON.parse(fs.readFileSync(path.join(out,'report.json'),'utf8'));
   Object.assign(report,previous);report.interactions=previous.interactions.filter(r=>!r.width);report.screenshots=[];
   for(const width of [1440,390])for(const theme of ['light','dark'])await interactions(width,theme);
   await motion();
   report.presentationNote='帽子贴合、细节和视线跟随以及放大彩带已更新；四组交互与运动回归复验。首页胶囊文字 #b45309 最小加深为 #b35309；刷新四组首页和帽子截图，范围外像素对比仍沿用同一基准。';
  }else{
  const selected=process.env.QA_CASE?routes.filter(([n])=>n===process.env.QA_CASE):routes;
  const jobs=[1440,390].flatMap(width=>['light','dark'].map(theme=>async()=>{
   for(const [name,route]of selected){await compare('outside',name,route,width,theme);await compare('off',name,route,width,theme);if(name!=='home')await compare('on',name,route,width,theme);}
   if(!process.env.QA_CASE||process.env.QA_CASE==='home')await interactions(width,theme);
  }));
  if(process.env.QA_PARALLEL)await Promise.all(jobs.map(run=>run()));else for(const run of jobs)await run();
  if(!process.env.QA_CASE||process.env.QA_CASE==='home')await motion();
  }
  assert.equal(report.comparisons.filter(r=>r.diffPixels!==0).length,0,'Pixel comparison failures; see report.json');
  assert.equal(report.comparisons.filter(r=>r.scriptRequestDelta!==(r.mode==='on'?2:1)).length,0,'Unexpected script requests; see report.json');
  assert.equal(report.comparisons.filter(r=>r.errors.length).length,0,'Browser errors; see report.json');
 }finally{
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  const images=fs.readdirSync(out).filter(n=>/^(home-on|hat-|candy-confetti).*\.png$/.test(n));
  fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><meta charset="utf-8"><title>Halloween 验收</title><style>body{font:15px system-ui;background:#fafafa;color:#222;margin:32px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}img{max-width:100%;height:auto}figure{margin:0;padding:20px;background:white;border:1px solid #ddd;border-radius:16px}summary{cursor:pointer;padding:12px}a{color:inherit} @media(max-width:700px){main{grid-template-columns:1fr}}</style><h1>万圣节装饰 · 本地验收</h1><p>Chrome · 1440 / 390 · 亮 / 暗。仅本地模拟日期，未上线。</p><p><a href="report.json">完整逐像素报告</a> · <a href="favicon.svg">浏览器实际 favicon SVG（非标签栏截图）</a></p><main>'+images.map(n=>'<figure><figcaption>'+n+'</figcaption><a href="'+n+'"><img loading="lazy" src="'+n+'"></a></figure>').join('')+'</main><h2>逐像素对比</h2>'+report.comparisons.map(r=>{const n=[r.mode,r.name,r.width,r.theme].join('-');return '<details><summary>'+n+'：'+JSON.stringify(r.diffPixels)+' 像素差异</summary><main><img loading="lazy" src="'+n+'-baseline.png"><img loading="lazy" src="'+n+'-candidate.png"></main></details>';}).join(''));
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});

/* Run after npm run build: PLAYWRIGHT_CHANNEL=msedge node test/mobile-inputs.browser.cjs.
 * --baseline records diagnostics from --dist=PATH without accepting them as passing.
 * All API traffic is served by this local fixture; external requests are blocked. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

const baseline = process.argv.includes('--baseline');
const distArg = process.argv.find(value => value.startsWith('--dist='));
const dist = path.resolve(distArg ? distArg.slice(7) : 'dist');
const post = { id:17, title:'2024.11.6 C语言程序设计——循环', author_name:'阅读者', category:'develop', tags:['develop'], summary:'循环语句的语法与示例。', cover_image:'/fixture-cover.svg', cover_crop:null, content:'# 循环的语法\n\n正文说明。\n\n## while 循环\n\n```c\n' + 'long_identifier_'.repeat(40) + '\n```\n\n| 名称 | 说明 |\n| --- | --- |\n| 名称 | ' + 'long_identifier_'.repeat(25) + ' |', content_format:'markdown', published_at:'2024-11-06T00:00:00.000Z', updated_at:'2026-09-18T00:00:00.000Z', status:'published' };
const list = { items:[post], total:1, page:1, pageSize:12 };
function fixture(url, referer) {
  const p=url.pathname;
  if(p==='/api/auth/session')return {user:/\/article\//.test(referer||'')?{id:123,username:'阅读者',role:'user',can_comment:1}:null};
  if(p==='/api/settings/site')return {brand:{name:'mooncci'},footer:{},hero:{title:'Explore the Programming',subtitle:'分享技术与生活。'},navigation:[],about:{enabled:false}};
  if(p==='/api/subscriptions/status')return {available:true};
  if(p==='/api/posts/17')return post;
  if(p.includes('/comments'))return [];
  if(p.includes('/analytics/'))return {views:12,count:12};
  if(p==='/api/posts/meta/categories')return [{category:'develop'}];
  if(p==='/api/posts/meta/tags')return [{tag:'develop'}];
  if(p==='/api/posts')return url.searchParams.get('format')==='paged'?list:[post];
  if(p.includes('/related'))return [];
  if(p.includes('/series'))return null;
  if(p==='/api/now')return {content:'目前在学习编程。'};
  if(p.includes('/activity')||p.includes('/projects'))return {items:[],total:0};
  if(p.includes('/login')||p.includes('/providers'))return {providers:[]};
  return {};
}
function inspect() {
  const w=document.documentElement.clientWidth;
  const label=e=>e.tagName+'.'+String(e.className);
  const all=[...document.querySelectorAll('body *')];
  const raw=all.filter(e=>e.getBoundingClientRect().right>w+1).map(label).slice(0,20);
  const actual=all.filter(e=>{
    const r=e.getBoundingClientRect(),s=getComputedStyle(e);
    if(r.right<=w+1||!r.width||!r.height||s.visibility==='hidden'||s.display==='none')return false;
    for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){
      if(['hidden','clip','auto','scroll'].includes(getComputedStyle(p).overflowX)&&p.getBoundingClientRect().right<=w+1)return false;
    }
    return true;
  }).map(label).slice(0,20);
  const inputs=[...document.querySelectorAll('input,textarea,select')].filter(e=>!['checkbox','radio','range'].includes(e.type)&&e.getBoundingClientRect().width&&e.getBoundingClientRect().height&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none').map(e=>({element:label(e),id:e.id,type:e.type,font:parseFloat(getComputedStyle(e).fontSize)}));
  const old=document.body.style.overflowX;document.body.style.overflowX='visible';
  const unclippedScrollWidth=document.documentElement.scrollWidth;
  document.body.style.overflowX=old;
  return {width:w,scrollWidth:document.documentElement.scrollWidth,unclippedScrollWidth,rawOffenders:raw,effectiveOffenders:actual,inputs};
}
(async()=>{
  assert.ok(fs.existsSync(path.join(dist,'index.html')), 'Build is required before the browser check');
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://local');
    res.setHeader('Cache-Control','no-store');
    if(url.pathname.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(fixture(url,req.headers.referer)));return;}
    if(url.pathname==='/fixture-cover.svg'){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200"><rect width="800" height="1200" fill="#ddd"/></svg>');return;}
    let file=path.resolve(dist,'.'+url.pathname);if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(dist,'index.html');
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  let browser;
  const results=[];
  try {
    browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||undefined});
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const page=await context.newPage();
    const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
    const check=async(label)=>{
      const result=await page.evaluate(inspect);results.push({page:label,...result});
      assert.ok(result.inputs.length,label+': fixture must expose an input (avoid vacuous passing)');
      if(!baseline){assert.equal(result.scrollWidth,result.width,label+': document overflow');assert.ok(result.unclippedScrollWidth<=result.width,label+': overflow must also pass without body clip');assert.deepEqual(result.effectiveOffenders,[],label+': uncontained overflow');for(const input of result.inputs)assert.ok(input.font>=16,label+': font under 16px: '+JSON.stringify(input));}
    };
    for(const [url,ready] of [['/','main'],['/article/17','.detail-title'],['/search?q=循环','#article-search'],['/login','#email'],['/register','#username'],['/forgot-password','#recovery-email'],['/reset-password?token=fixture','#new-password']]){
      await page.goto(origin+url);await page.locator(ready).first().waitFor({state:'visible'});await page.waitForTimeout(500);
      if(url==='/'||url==='/article/17'){
        try {await page.locator('#subscribe-email').waitFor({state:'attached',timeout:5000});}
        catch(error){console.error(JSON.stringify({url,pageErrors,text:await page.locator('body').innerText()}));throw error;}
      }
      await check(url);
      if(url==='/article/17'){
        assert.ok(await page.locator('textarea[aria-label="写下你的评论"]').count(),'Comment fixture must render a textarea');
        const trigger=page.getByRole('button',{name:'阅读设置',exact:false}).first();await trigger.click();await page.locator('#reading-settings-panel').waitFor({state:'visible'});await check('/article/17 reading panel');await page.getByRole('button',{name:'收起阅读设置'}).click();
      }
      if(url==='/'){
        await page.getByRole('button',{name:'搜索',exact:true}).click();await page.locator('#header-query').waitFor({state:'visible'});await check('/ search popover');await page.keyboard.press('Escape');
      }
    }
    assert.deepEqual(pageErrors,[],'Fixture must render without React errors');
    console.log(JSON.stringify({baseline,dist,checks:results},null,2));
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});

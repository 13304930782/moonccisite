const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({server:{host:'127.0.0.1',port:4996,strictPort:true,fs:{allow:[process.cwd(),require('node:path').resolve(process.cwd(),'..')]}},logLevel:'error'});
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {})});
    const context = await browser.newContext({locale:'zh-CN',viewport:{width:1280,height:900},reducedMotion:'no-preference'});
    const page = await context.newPage();
    page.on('pageerror', error => console.error('PAGE ERROR',error.stack));
    let stats = {date:'2026-11-09',pets:0,hits:0}, failNext=false;
    const requests=[];
    await page.route('**/api/**', async route => {
      const req=route.request(), url=new URL(req.url());
      let json={items:[],total:0};
      if(url.pathname==='/api/settings/site') json={brand:{},hero:{},footer:{}};
      if(['/api/posts','/api/categories','/api/tags'].includes(url.pathname)) json=[];
      if(url.pathname==='/api/auth/session') return route.fulfill({status:401,json:{message:'not logged in'}});
      if(url.pathname==='/api/auth/providers') json={providers:[]};
      if(url.pathname==='/api/weather-mood') json={data:{status:'needs_location',mode:'weather',refreshAt:'2099-01-01T00:00:00Z'}};
      if(url.pathname==='/api/weather-mood/interactions') {
        if(req.method()==='POST') {
          const body=req.postDataJSON(); requests.push(body.kind);
          if(failNext) { failNext=false; return route.fulfill({status:503,json:{message:'unavailable'}}); }
          stats[body.kind==='pet'?'pets':'hits']++;
        }
        json={data:{...stats}};
      }
      if(url.pathname==='/api/activity') json={items:[],total:0};
      await route.fulfill({json});
    });
    await page.goto('http://127.0.0.1:4996/');
    const ball=page.locator('.weather-companion-ball'), root=page.locator('.weather-companion');
    await ball.waitFor({timeout:8000}).catch(async error=>{console.error('Page content:',(await page.locator('body').innerText()).slice(0,800));throw error;});
    console.log('ball ready');
    async function stroke() {
      const box=await ball.boundingBox();
      assert.ok(box);
      await page.mouse.move(box.x+box.width*.35,box.y+box.height*.5);
      await page.mouse.down();
      await page.mouse.move(box.x+box.width*.8,box.y+box.height*.5,{steps:5});
      await page.mouse.up();
    }
    async function speech(text) { await page.locator('.weather-companion-pet').filter({hasText:text}).waitFor({state:'visible',timeout:3000}); }
    await stroke();
    console.log('first stroke');
    await speech('摸到了。');
    assert.equal(stats.pets,1);
    stats.pets=9;
    await stroke();
    await speech('再摸我要害羞了。');
    assert.equal(stats.pets,10);
    stats.hits=3;
    await ball.dblclick({delay:70});
    await speech('生气计时加长。');
    assert.equal(stats.hits,4);
    await page.waitForTimeout(450);
    assert.equal(await ball.getAttribute('aria-expanded'),'false','double-click must not open the card');
    await page.waitForFunction(() => document.querySelector('.weather-companion')?.getAttribute('data-emotion') === '21');
    await stroke();
    await speech('再摸我要害羞了。');
    assert.equal(stats.pets,11);
    assert.equal(await root.getAttribute('data-emotion'),'21');
    await page.waitForTimeout(3700);
    assert.equal(await root.getAttribute('data-emotion'),'21','fourth hit remains angry beyond 3500ms');
    await page.waitForTimeout(1500);
    assert.notEqual(await root.getAttribute('data-emotion'),'21','angry face eventually restores');
    await ball.click();
    await page.locator('.weather-companion-panel').waitFor();
    await page.getByRole('button',{name:'打一下'}).focus();
    await page.keyboard.press('Enter');
    await speech('生气计时加长。');
    assert.equal(stats.hits,5);
    assert.ok(await page.locator('.weather-companion-panel').isVisible());
    assert.ok(requests.filter(x=>x==='hit').length===2);
    failNext=true;
    const failure=page.waitForResponse(r=>r.url().includes('/api/weather-mood/interactions') && r.request().method()==='POST' && r.status()===503);
    await page.getByRole('button',{name:'打一下'}).click();
    await failure;
    await page.waitForTimeout(100);
    assert.equal(stats.hits,5,'failed hit is not counted');
    assert.equal(await page.locator('.weather-companion-pet').count(),0,'failed hit has no success speech');
    await page.goto('http://127.0.0.1:4996/login');
    const password=page.locator('input[type=password]').first();
    await password.waitFor(); await password.focus();
    await page.getByText('你输密码，我闭眼。',{exact:true}).waitFor({state:'visible'});
    await context.close();
    const idleContext=await browser.newContext({locale:'zh-CN',viewport:{width:1280,height:900},reducedMotion:'no-preference'});
    await idleContext.addInitScript(() => {
      const original=window.setTimeout;
      window.setTimeout=(fn,delay,...args)=>original(fn,delay>=28000 && delay<=55000?150:delay,...args);
    });
    const idlePage=await idleContext.newPage();
    idlePage.on('pageerror',error=>console.error('IDLE PAGE ERROR',error.message));
    await idlePage.route('**/api/**', async route => {
      const p=new URL(route.request().url()).pathname;
      if(p==='/api/settings/site') return route.fulfill({json:{brand:{},hero:{},footer:{}}});
      if(['/api/posts','/api/categories','/api/tags'].includes(p)) return route.fulfill({json:[]});
      if(p==='/api/weather-mood') return route.fulfill({json:{data:{status:'needs_location',mode:'weather',refreshAt:'2099-01-01T00:00:00Z'}}});
      if(p==='/api/activity') return route.fulfill({status:503,json:{message:'offline'}});
      if(p==='/api/posts/example') return route.fulfill({json:{id:1,slug:'example',status:'published',title:'文章示例',content:'正文',tags:[],summary:'简介',author_name:'作者'}});
      if(p.startsWith('/api/comments/')) return route.fulfill({json:[]});
      if(p.startsWith('/api/series/article/')) return route.fulfill({status:404,json:{message:'none'}});
      return route.fulfill({json:{items:[],total:0}});
    });
    await idlePage.goto('http://127.0.0.1:4996/');
    await idlePage.locator('.weather-companion-speech').first().waitFor({state:'visible',timeout:5000});
    const firstIdle=await idlePage.locator('.weather-companion-speech').first().innerText();
    assert.ok(firstIdle && firstIdle!=='首页安静的时候，我就待在这儿。','ordinary idle remains available when news fails');
    await idlePage.getByText('首页安静的时候，我就待在这儿。',{exact:true}).waitFor({state:'visible',timeout:5000});
    await idlePage.goto('http://127.0.0.1:4996/updates');
    await idlePage.getByText('更新都在这边。',{exact:true}).waitFor({state:'visible',timeout:5000});
    await idlePage.goto('http://127.0.0.1:4996/article/example');
    await idlePage.getByText('这篇要是长，就慢慢看。',{exact:true}).waitFor({state:'visible',timeout:5000}).catch(async error=>{console.error('article diagnostic',idlePage.url(),await idlePage.locator('.weather-companion').count(),(await idlePage.locator('body').innerText()).slice(-350));throw error;});
    await idleContext.close();
    for(const mode of ['system','local']) {
      const reducedContext=await browser.newContext({locale:'zh-CN',viewport:{width:1280,height:900},reducedMotion:mode==='system'?'reduce':'no-preference'});
      await reducedContext.addInitScript(local => {
        if(local) localStorage.setItem('mooncci-reading', JSON.stringify({reduceMotion:true}));
        const original=window.setTimeout;
        window.setTimeout=(fn,delay,...args)=>original(fn,delay>=28000 && delay<=55000?150:delay,...args);
      },mode==='local');
      const reducedPage=await reducedContext.newPage();
      await reducedPage.route('**/api/**', async route => {
        const p=new URL(route.request().url()).pathname;
        if(p==='/api/settings/site') return route.fulfill({json:{brand:{},hero:{},footer:{}}});
        if(['/api/posts','/api/categories','/api/tags'].includes(p)) return route.fulfill({json:[]});
        if(p==='/api/weather-mood') return route.fulfill({json:{data:{status:'needs_location',mode:'weather',refreshAt:'2099-01-01T00:00:00Z'}}});
        return route.fulfill({json:{items:[],total:0}});
      });
      await reducedPage.goto('http://127.0.0.1:4996/');
      await reducedPage.locator('.weather-companion-ball').waitFor({timeout:8000});
      await reducedPage.waitForTimeout(1000);
      assert.equal(await reducedPage.locator('.weather-companion-speech').count(),0,`${mode} reduced motion suppresses idle speech`);
      await reducedContext.close();
    }
    const enContext=await browser.newContext({locale:'en-US',viewport:{width:1280,height:900},reducedMotion:'no-preference'});
    await enContext.addInitScript(() => {
      const original=window.setTimeout;
      window.setTimeout=(fn,delay,...args)=>original(fn,delay>=28000 && delay<=55000?150:delay,...args);
    });
    const enPage=await enContext.newPage();
    await enPage.route('**/api/**', async route => {
      const p=new URL(route.request().url()).pathname;
      if(p==='/api/settings/site') return route.fulfill({json:{brand:{},hero:{},footer:{}}});
      if(['/api/posts','/api/categories','/api/tags'].includes(p)) return route.fulfill({json:[]});
      if(p==='/api/weather-mood') return route.fulfill({json:{data:{status:'needs_location',mode:'weather',refreshAt:'2099-01-01T00:00:00Z'}}});
      if(p==='/api/activity') return route.fulfill({json:{items:[{type:'post',title:'Test title'}],total:1}});
      return route.fulfill({json:{items:[],total:0}});
    });
    await enPage.goto('http://127.0.0.1:4996/en');
    await enPage.getByText('Recently updated: Test title',{exact:true}).waitFor({state:'visible',timeout:5000});
    await enContext.close();
    for(const fixture of [{locale:'zh-CN',path:'/',title:'公开文章'}, {locale:'zh-CN',path:'/',title:''}, {locale:'en-US',path:'/en',title:''}]) {
      const ctx=await browser.newContext({locale:fixture.locale,viewport:{width:1280,height:900},reducedMotion:'no-preference'});
      await ctx.addInitScript(() => {
        const original=window.setTimeout;
        window.setTimeout=(fn,delay,...args)=>original(fn,delay>=28000 && delay<=55000?150:delay,...args);
      });
      const p=await ctx.newPage();
      await p.route('**/api/**', async route => {
        const pathname=new URL(route.request().url()).pathname;
        if(pathname==='/api/settings/site') return route.fulfill({json:{brand:{},hero:{},footer:{}}});
        if(['/api/posts','/api/categories','/api/tags'].includes(pathname)) return route.fulfill({json:[]});
        if(pathname==='/api/weather-mood') return route.fulfill({json:{data:{status:'needs_location',mode:'weather',refreshAt:'2099-01-01T00:00:00Z'}}});
        if(pathname==='/api/activity') return route.fulfill({json:{items:fixture.title?[{type:'post',title:fixture.title}]:[],total:fixture.title?1:0}});
        return route.fulfill({json:{items:[],total:0}});
      });
      await p.goto('http://127.0.0.1:4996'+fixture.path);
      if(fixture.title) await p.getByText('最近更新了一条：公开文章',{exact:true}).waitFor({state:'visible',timeout:5000});
      else {
        await p.locator('.weather-companion-speech').first().waitFor({state:'visible',timeout:5000});
        await p.waitForTimeout(800);
        assert.equal(await p.getByText(fixture.locale==='en-US'?/^Recently updated:/:/^最近更新了一条：/).count(),0,'empty activity emits no news');
      }
      await ctx.close();
    }
    console.log('PASS: real pet/hit gestures, fourth-hit duration, pet while angry, open panel, button, password focus and page idle rotation');
  } finally { if(browser) await browser.close(); await server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});

const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host:'127.0.0.1', port:0, fs:{ allow:[process.cwd(),path.resolve(process.cwd(),'..')] } }, logLevel:'error' });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ headless:true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel:process.env.PLAYWRIGHT_CHANNEL } : {}) });
    for (const cloud of [false,true]) {
      const page = await browser.newPage({ locale:'zh-CN', viewport:{width:cloud?375:1280,height:900} });
      if (!cloud) await page.addInitScript(() => { const now=Date.now(); localStorage.setItem('mooncci-weather-location-v2',JSON.stringify({version:2,location:{name:'San Jose',region:'United States · California',countryCode:'US',provider:'nominatim',latitude:37.3,longitude:-121.9},source:'manual',selectedAt:now,expiresAt:now+86400000})); });
      let answered = false;
      await page.route('**/api/**', async route => {
        const url = new URL(route.request().url()), method = route.request().method();
        let json = { items:[], total:0 };
        if (url.pathname === '/api/settings/site') json = {brand:{},hero:{},footer:{}};
        if (['/api/posts','/api/categories','/api/tags'].includes(url.pathname)) json = [];
        if (url.pathname === '/api/auth/session') return route.fulfill({status:401,json:{message:'not logged in'}});
        if (url.pathname === '/api/weather-mood') json = {data:{status:'ready',mode:'weather',city:{name:'San Jose'},weather:{label:'雾',min:8,max:24},weatherSource:'open-meteo',refreshAt:'2099-01-01T00:00:00Z'}};
        if (url.pathname === '/api/weather-mood/interactions') json = {data:{date:'2026-11-12',pets:0,hits:0}};
        if (url.pathname === '/api/daily-question') json = {active:true,id:1,text:'今天想做什么？',choices:cloud?null:['散步','阅读'],answered};
        if (url.pathname === '/api/daily-question/summary') json = {summary:null};
        if (url.pathname === '/api/daily-question/answers' && method === 'POST') { answered = true; json = {accepted:true,preview:cloud?{type:'wordcloud',total:3,words:[{text:'阳光',count:2}]}:{type:'choice',total:3,counts:[2,1]}}; }
        if (url.pathname === '/api/daily-question/preview') json = {preview:cloud?{type:'wordcloud',total:3,words:[{text:'阳光',count:2}]}:{type:'choice',total:3,counts:[2,1]}};
        await route.fulfill({json});
      });
      await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
      await page.locator('.weather-companion-ball').click();
      const card = page.locator('.daily-question-card');
      await card.waitFor();
      if (cloud) {
        assert.equal(await page.locator('.weather-city-icon').innerText(),'🌐');
        assert.match(await page.locator('.weather-city-copy').innerText(),/未选择城市\s+选一个，心情跟天气走/);
        assert.equal(await page.locator('.weather-city-copy').evaluate(el => [...el.children].every(child => child.scrollWidth <= child.clientWidth)),true,'unselected city text is not clipped');
      } else {
        assert.equal(await page.locator('.weather-city-icon').innerText(),'🇺🇸');
        assert.match(await page.locator('.weather-city-copy').innerText(),/San Jose\s+California/);
        assert.doesNotMatch(await page.locator('.weather-city-copy').innerText(),/United States/);
        await page.locator('.weather-companion-forecast').waitFor();
        assert.doesNotMatch(await page.locator('.weather-companion-forecast').innerText(),/San Jose/);
      }
      if (cloud) await card.locator('textarea').fill('今天阳光很好');
      else await card.locator('input[type=radio]').first().check();
      await card.getByRole('button',{name:'提交回答'}).click();
      const dialog=page.getByRole('dialog'); await dialog.waitFor();
      if(cloud) assert.match(await dialog.innerText(),/阳光/);
      await dialog.getByRole('button',{name:'完成'}).click();
      await dialog.waitFor({state:'hidden'});
      assert.equal(await page.locator('.weather-companion-panel').isVisible(),true,'completion keeps companion panel open');
      assert.equal(await page.locator('.weather-companion-panel').evaluate(el=>el.scrollWidth <= el.clientWidth),true,'card has no horizontal overflow');
      const done=page.locator('.companion-ask-done');
      assert.equal(await done.innerText(),'已回答\n查看结果');
      await done.getByRole('button',{name:'查看结果'}).click(); await dialog.waitFor();
      await dialog.getByRole('button',{name:'完成'}).click(); await dialog.waitFor({state:'hidden'});
      assert.equal(await card.count(),0,'answered question hides form and title');
      await page.reload(); await page.locator('.weather-companion-ball').click();
      await done.waitFor(); assert.equal(await card.count(),0,'answered state survives reload');
      await page.close();
    }
    console.log('Daily question choice and word cloud dialog: PASS');
  } finally { await browser?.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });

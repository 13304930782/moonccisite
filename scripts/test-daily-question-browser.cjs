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
      const page = await browser.newPage({ locale:'zh-CN', viewport:{width:1280,height:900} });
      let answered = false;
      await page.route('**/api/**', async route => {
        const url = new URL(route.request().url()), method = route.request().method();
        let json = { items:[], total:0 };
        if (url.pathname === '/api/settings/site') json = {brand:{},hero:{},footer:{}};
        if (['/api/posts','/api/categories','/api/tags'].includes(url.pathname)) json = [];
        if (url.pathname === '/api/auth/session') return route.fulfill({status:401,json:{message:'not logged in'}});
        if (url.pathname === '/api/weather-mood') json = {data:{status:'needs_location',mode:'weather',refreshAt:'2099-01-01T00:00:00Z'}};
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
      if (cloud) await card.locator('textarea').fill('今天阳光很好');
      else await card.locator('input[type=radio]').first().check();
      await card.getByRole('button',{name:'提交回答'}).click();
      const dialog=page.getByRole('dialog'); await dialog.waitFor();
      if(cloud) assert.match(await dialog.innerText(),/阳光/);
      await dialog.getByRole('button',{name:'完成'}).click();
      await dialog.waitFor({state:'hidden'});
      assert.equal(await card.isVisible(),true,'completion keeps companion panel open');
      await card.getByRole('button',{name:'查看回答预览'}).click();
      await dialog.waitFor(); await page.keyboard.press('Escape'); await dialog.waitFor({state:'hidden'});
      assert.equal(await card.isVisible(),true,'escape closes the modal only');
      await page.close();
    }
    console.log('Daily question choice and word cloud dialog: PASS');
  } finally { await browser?.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });

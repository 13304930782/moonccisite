const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 4995, fs: { allow: [process.cwd(), require('node:path').resolve(process.cwd(), '..')] } }, logLevel: 'error' });
  let browser;
  try {
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
    await context.addInitScript(() => { const original = window.setTimeout; window.setTimeout = (fn, delay, ...args) => original(fn, delay >= 28000 && delay <= 55000 ? 150 : delay, ...args); });
    const page = await context.newPage();
    let aside = '这版图我改了三次';
    let detailRequests = 0;
    const mock = route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/posts/one') {
        detailRequests++;
        return route.fulfill({ json: { id: 1, slug: 'one', status: 'published', title: '测试文章', summary: '文章简介', content: '# 正文\n\n内容', tags: [], author_name: '作者', aside } });
      }
      if (path === '/api/settings/site') return route.fulfill({ json: { brand: {}, hero: {}, footer: {} } });
      if (['/api/posts', '/api/categories', '/api/tags'].includes(path)) return route.fulfill({ json: [] });
      if (path === '/api/weather-mood') return route.fulfill({ json: { data: { status: 'needs_location', mode: 'weather', refreshAt: '2099-01-01T00:00:00Z', statusLine: '今天在写代码', statusEndsAt: '2099-01-01T00:00:00Z' } } });
      if (path === '/api/weather-mood/interactions') return route.fulfill({ json: { data: { date: '2026-11-12', pets: 0, hits: 0 } } });
      if (path === '/api/auth/session') return route.fulfill({ status: 401, json: { message: 'not signed in' } });
      if (path.startsWith('/api/comments/')) return route.fulfill({ json: [] });
      if (path.startsWith('/api/series/article/')) return route.fulfill({ status: 404, json: { message: 'none' } });
      if (path.endsWith('/discovery')) return route.fulfill({ json: { related: [], previous: null, next: null } });
      return route.fulfill({ json: { items: [], total: 0 } });
    };
    await page.route('**/api/**', mock);
    await page.goto(`${origin}/article/one`);
    await page.locator('.article-aside').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.article-aside').innerText(), aside);
    await page.locator('.companion-bubble--aside').waitFor({ state: 'visible', timeout: 8000 });
    assert.equal(await page.locator('.companion-bubble--aside').innerText(), aside);
    await page.locator('.companion-bubble--status').filter({ hasText: '今天在写代码' }).waitFor({ state: 'visible', timeout: 8000 });
    assert.equal(detailRequests, 1, 'companion reuses the loaded detail rather than requesting again');
    await page.locator('.companion-bubble--aside').waitFor({ state: 'visible', timeout: 8000 });
    await page.locator('a[href="/articles"]').first().click();
    await page.waitForURL('**/articles');
    await page.locator('.companion-bubble--aside').waitFor({ state: 'hidden', timeout: 1500 });
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('.companion-bubble--aside').count(), 0, 'aside is not replayed on the list');
    aside = null;
    await page.goto(`${origin}/article/one`);
    await page.locator('.detail-title').waitFor();
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('.article-aside').count(), 0, 'empty aside leaves no line');
    assert.equal(await page.locator('.companion-bubble--aside').count(), 0, 'empty aside is not spoken');
    await context.close();
    aside = '这版图我改了三次';
    const mobile = await browser.newContext({ locale: 'zh-CN', viewport: { width: 375, height: 800 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1' });
    await mobile.addInitScript(() => { const original = window.setTimeout; window.setTimeout = (fn, delay, ...args) => original(fn, delay >= 28000 && delay <= 55000 ? 150 : delay, ...args); });
    const phone = await mobile.newPage();
    await phone.route('**/api/**', mock);
    await phone.goto(`${origin}/article/one`);
    await phone.locator('.companion-bubble--aside').waitFor({ state: 'visible', timeout: 8000 });
    assert.equal(await phone.locator('.companion-bubble--aside').innerText(), aside);
    assert.equal(await phone.locator('.weather-companion--edge-hidden').count(), 0, 'phone companion is visible while speaking');
    await mobile.close();
    console.log('Article aside presentation, shared detail, navigation and empty state passed.');
  } finally { await browser?.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

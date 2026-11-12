const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 4299, strictPort: true, fs: { allow: [process.cwd(), require('node:path').resolve(process.cwd(), '..')] } }, logLevel: 'error' });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await page.addInitScript(() => localStorage.setItem('mooncci-reading-20', JSON.stringify({ progress: .33, revision: 1, updated_at: Date.now() })));
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      let body = {};
      if (path === '/api/auth/session') body = { user: null };
      else if (path === '/api/settings/site') body = { brand: {}, hero: {}, footer: {} };
      else if (path === '/api/engagement/config') body = { enabled: true };
      else if (path === '/api/weather-mood') body = { data: { status: 'needs_location', mode: 'weather', refreshAt: '2099-01-01T00:00:00Z' } };
      else if (path === '/api/posts/20') body = { id: 20, title: '返回导航测试', content: '## 内容\n\n测试正文。', tags: [], author_name: 'mooncci' };
      else if (path === '/api/posts/20/discovery') body = { related: [], previous: null, next: null };
      else if (path === '/api/series/article/20') body = null;
      else if (path === '/api/posts') body = { items: [], total: 0 };
      else if (path.includes('/comments')) body = [];
      return route.fulfill({ json: body });
    });
    await page.goto('http://127.0.0.1:4299/');
    await page.goto('http://127.0.0.1:4299/article/20');
    await page.locator('.detail-title').waitFor({timeout:10000}).catch(async e => { console.log('BODY', (await page.locator('body').innerText()).slice(0,1000)); throw e; });
    const toast = page.locator('.resume-toast');
    await toast.waitFor();
    const toastBox = await toast.boundingBox();
    assert.ok(toastBox.x >= 0 && toastBox.x + toastBox.width <= 375, 'reading prompt fits the phone viewport');
    assert.ok((await page.getByRole('button', { name: '继续', exact: true }).boundingBox()).height >= 44, 'resume action has a 44px hit area');
    assert.ok(Math.abs(toastBox.x + toastBox.width / 2 - 187.5) < 1, 'reading prompt is centered');
    await page.locator('[data-site-back]').click();
    await page.locator('.articles-heading').waitFor();
    assert.equal(new URL(page.url()).pathname, '/articles');
    await page.goBack();
    await page.waitForURL('http://127.0.0.1:4299/');
    console.log('PASS: direct article fallback replaces the history entry, so Back returns to the original page');
  } finally { await browser?.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

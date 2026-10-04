const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { chromium } = require('playwright');
(async () => {
  const { preview } = await import('vite');
  const server = await preview({ preview: { host: '127.0.0.1', port: 4291, strictPort: true } });
  const browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'msedge' } : {}), headless: true });
  await fs.mkdir('.cache/diagnostic-qa', { recursive: true });
  try {
    for (const width of [390, 768, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const requests = []; const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', async route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        requests.push({ path, diagnostic: request.headers()['x-mooncci-diagnostic'] });
        const body = path === '/api/auth/me' ? { user: null }
          : path === '/api/site-settings' ? { brand: {}, weather: { enabled: false } }
          : path === '/api/posts' ? { items: [], total: 0, page: 1, pageSize: 12 }
          : path === '/api/categories' || path === '/api/tags' ? [] : {};
        await route.fulfill({ json: body, headers: { 'X-Diagnostic-Request-ID': 'c060b54d-dd73-4304-9bc0-029a63dd017b', 'Server-Timing': 'app;dur=15.5', 'X-Diagnostic-Ingress': 'CN_DIRECT' } });
      });
      await page.goto('http://127.0.0.1:4291/diagnostics');
      await page.getByRole('heading', { name: '记录一次慢访问' }).waitFor();
      assert(requests.every(r => !r.diagnostic), 'Default-off requests must be unchanged');
      await page.getByRole('button', { name: '开始新记录' }).click();
      await page.getByRole('navigation', { name: '诊断测试页面' }).getByRole('link', { name: '文章列表' }).click();
      await page.waitForResponse(r => new URL(r.url()).pathname === '/api/posts');
      await page.goBack();
      await page.getByRole('button', { name: '停止记录', exact: true }).click();
      assert(requests.some(r => r.path === '/api/posts' && r.diagnostic === '1'));
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: '导出脱敏报告' }).click();
      const download = await downloadPromise;
      const report = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
      assert(report.rows.some(r => r.type === 'api' && r.path === '/api/posts' && r.api_ms === 15.5));
      assert(report.rows.every(r => !('body' in r) && !('headers' in r) && !String(r.path).includes('?')));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `.cache/diagnostic-qa/${width}.png`, fullPage: true });
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.screenshot({ path: `.cache/diagnostic-qa/${width}-dark.png`, fullPage: true });
      await page.getByRole('button', { name: '清除记录' }).click();
      assert.equal(await page.evaluate(() => sessionStorage.getItem('mooncci.diagnostics.v1')), null);
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ width, rows: report.rows.length, optedRequests: requests.filter(r => r.diagnostic).length, errors }));
      await page.close();
    }
  } finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });

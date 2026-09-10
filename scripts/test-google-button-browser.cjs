const assert = require('node:assert/strict');
const { chromium } = require('playwright');
async function main() {
  const { preview } = await import('vite');
  const server = await preview({ preview: { host: '127.0.0.1', port: 4196, strictPort: true } });
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('mooncci-theme', 'dark'));
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/auth/me') return route.fulfill({ status: 401, json: {} });
      return route.fulfill({ json: path === '/api/auth/providers' ? { providers: [
        { provider: 'google', name: 'Google', client_id: 'fixture-client' }, { provider: 'qq', name: 'QQ' },
      ] } : {} });
    });
    const external = [];
    let startBody;
    await page.route('**/api/auth/google/start', async route => {
      startBody = route.request().postDataJSON();
      await route.fulfill({ json: { url: 'https://accounts.google.com/o/oauth2/v2/auth?state=fixture' } });
    });
    await page.route('https://accounts.google.com/**', route => {
      external.push(route.request().url());
      return route.fulfill({ contentType: 'text/html', body: '<h1>Google authorization fixture</h1>' });
    });
    for (const path of ['/login', '/register']) {
      await page.goto('http://127.0.0.1:4196' + path);
      const local = page.locator('.auth-google-local');
      await local.waitFor();
      assert.equal(await local.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(19, 19, 20)');
      assert.equal(await page.locator('iframe').count(), 0);
      assert.equal(await page.locator('script[src*="accounts.google.com"]').count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.getByRole('button', { name: '切换浅色主题' }).click();
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.auth-google-local')).backgroundColor === 'rgb(255, 255, 255)');
      await local.click();
      await page.waitForURL('https://accounts.google.com/**');
      assert.ok(startBody && typeof startBody === 'object');
    }
    assert.equal(external.length, 2, 'Google is contacted only by the two explicit navigations');
    assert.ok(external.every(url => url.includes('/o/oauth2/v2/auth?')));
    assert.deepEqual(errors, []);
    console.log('PASS Google local button: no SDK/iframe, light/dark styling, mobile layout, login/signup direct navigation');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.httpServer.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

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
    let mode = 'blocked';
    let requests = 0;
    await page.route('https://accounts.google.com/gsi/client*', route => {
      requests++;
      if (mode === 'blocked') return route.abort();
      return route.fulfill({ contentType: 'application/javascript', body: `
        window.google = { accounts: { id: {
          initialize(options) { window.googleInit = options; },
          renderButton(host, options) {
            window.googleOptions = options;
            const frame = document.createElement('iframe');
            frame.style.cssText = 'border:0;width:100%;height:40px';
            frame.srcdoc = '<button style="width:100%;height:40px;background:' +
              (options.theme === 'filled_black' ? '#131314;color:#e3e3e3' : '#fff;color:#1f1f1f') +
              ';border:1px solid #8e918f">Google fixture</button>';
            host.appendChild(frame);
          }
        } } };
      ` });
    });
    await page.goto('http://127.0.0.1:4196/login');
    const local = page.locator('.auth-google-local');
    await local.waitFor();
    await page.getByRole('status').filter({ hasText: '暂时无法连接 Google' }).waitFor();
    assert.equal(await local.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(19, 19, 20)');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const before = await page.locator('.auth-google-slot').boundingBox();
    mode = 'ready';
    await local.click();
    await local.waitFor({ state: 'hidden' });
    assert.equal(requests, 2, 'failed script is removed so retry makes a fresh request');
    assert.equal(await page.evaluate(() => window.googleOptions.theme), 'filled_black');
    assert.equal(await page.evaluate(() => window.googleInit.client_id), 'fixture-client');
    assert.equal(await page.evaluate(() => window.googleInit.ux_mode), 'popup');
    const after = await page.locator('.auth-google-slot').boundingBox();
    assert.equal(after.height, before.height);
    assert.equal(after.width, before.width);
    await page.getByRole('button', { name: '切换浅色主题' }).click();
    await page.waitForFunction(() => window.googleOptions.theme === 'outline');
    await local.waitFor({ state: 'hidden' });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForFunction(() => window.googleOptions.width === 400);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    // A stalled script also keeps the local button visible and expires instead of hanging forever.
    await page.unroute('https://accounts.google.com/gsi/client*');
    let release;
    await page.route('https://accounts.google.com/gsi/client*', async route => {
      await new Promise(resolve => { release = resolve; });
      await route.abort();
    });
    await page.goto('http://127.0.0.1:4196/register', { waitUntil: 'domcontentloaded' });
    await local.waitFor();
    await page.getByRole('status').filter({ hasText: '暂时无法连接 Google' }).waitFor({ timeout: 15000 });
    assert.match(await local.innerText(), /注册/);
    release();
    assert.deepEqual(errors, []);
    console.log('PASS Google local display, blocked/stalled SDK, retry, native theme, responsive size and retained popup/client ID');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.httpServer.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

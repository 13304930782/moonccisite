const assert = require('node:assert/strict');
const { chromium, webkit } = require('playwright');
const fs = require('node:fs');
(async () => {
  const vite = await (await import('vite')).preview({ preview: { host: '127.0.0.1', port: 4277, strictPort: true } });
  let browser;
  try {
    browser = await (process.env.PLAYWRIGHT_BROWSER === 'webkit' ? webkit : chromium).launch(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote'] } : {});
    fs.mkdirSync('.cache/mail-setup', { recursive: true });
    for (const width of [320, 390, 768, 1440]) for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
      const sent = [], errors = []; let fail = true;
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(t => {
        if (window !== window.top) return;
        localStorage.setItem('mooncci-theme', t);
        window.__copies = [];
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__copies.push(text); } } });
      }, theme);
      await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
      await page.route('**/api/**', async r => {
        sent.push({ url: r.request().url(), body: r.request().postData(), headers: r.request().headers() });
        if (new URL(r.request().url()).pathname === '/api/mail-setup/profile') {
          if (fail) return r.fulfill({ status: 503, json: { message: 'busy' } });
          return r.fulfill({ status: 201, json: { download: '/api/mail-setup/profile/'+'a'.repeat(64)+'.mobileconfig' } });
        }
        return r.fulfill({ json: {} });
      });
      await page.goto('http://127.0.0.1:4277/mail-setup');
      const input = page.getByLabel('完整邮箱地址', { exact: true }); await input.waitFor();
      await input.fill('someone@gmail.com'); assert(await page.getByRole('alert').isVisible()); assert(await page.getByRole('button', { name: '生成 Apple 配置' }).isDisabled());
      const email = "Ada.O'Neil&work+tag@mooncci.site";
      await input.fill(email);
      await page.getByRole('button', { name: '复制用户名', exact: true }).click();
      await page.getByRole('button', { name: '复制整套参数', exact: true }).click();
      const copies = await page.evaluate(() => window.__copies); assert.equal(copies[0], email); assert(copies[1].includes('587')); assert(copies[1].includes('STARTTLS'));
      assert(!sent.some(x => (x.body || '').includes(email)), 'typing and copying must not transmit email');
      await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw Error('denied'); }; });
      await page.getByRole('button', { name: '复制用户名', exact: true }).click();
      assert.equal(await page.getByLabel('手动复制内容').inputValue(), email);
      assert(await page.getByLabel('手动复制内容').evaluate(el => el.selectionEnd === el.value.length));
      await page.getByRole('button', { name: '生成 Apple 配置' }).click();
      await page.getByRole('alert').waitFor(); assert.equal(await input.inputValue(), email);
      fail = false;
      await page.getByRole('button', { name: '生成 Apple 配置' }).click();
      const link = page.getByRole('link', { name: '下载未签名描述文件' }); await link.waitFor();
      assert.match(await link.getAttribute('href'), /\.mobileconfig$/); assert.equal(await link.getAttribute('referrerpolicy'), 'no-referrer');
      const profiles = sent.filter(x => x.url.endsWith('/api/mail-setup/profile')); assert.equal(profiles.length, 2); assert(profiles.every(x => x.body === email && x.headers['x-requested-with'] === 'XMLHttpRequest'));
      assert(!sent.some(x => x.url.includes(email))); assert(!sent.some(x => x.url.includes('/analytics/view')));
      assert(!await page.evaluate(e => JSON.stringify(localStorage).includes(e) || JSON.stringify(sessionStorage).includes(e) || location.href.includes(e), email));
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `.cache/mail-setup/${process.env.PLAYWRIGHT_BROWSER || 'chromium'}-${width}-${theme}.png`, fullPage: true });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width} ${theme} overflow`);
      await input.fill('changed@mooncci.site'); assert.equal(await link.count(), 0);
      await input.fill('A'.repeat(64)+'@mooncci.site'); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []); await page.close(); console.log('PASS mail setup', width, theme);
    }
  } finally { await browser?.close(); await new Promise(resolve => vite.httpServer.close(resolve)); }
})().catch(e => { console.error(e); process.exitCode = 1; });

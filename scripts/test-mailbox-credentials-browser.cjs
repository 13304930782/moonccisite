const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');

(async () => {
  const { preview } = await import('vite');
  const server = await preview({ preview: { host: '127.0.0.1', port: 4281, strictPort: true } });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  fs.mkdirSync('.cache/mailbox-credentials-qa', { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const errors = [];
    const calls = [];
    let status = 'idle';
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__copies = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true,
        value: { writeText: async value => { window.__copies.push(value); } } });
    });
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      calls.push(path);
      const body = path === '/api/auth/session' ? { user: { id: 2, username: 'reader', email: 'reader@example.com', role: 'user', status: 'active' } }
        : path === '/api/mailboxes/me' ? { access: { status: 'active', mailbox_address: 'reader@mooncci.site', daily_limit: 10, password_change_status: status } }
        : path === '/api/mailboxes/sent' ? { messages: [] }
        : path === '/api/mailboxes/folders/inbox' ? { messages: [], total: 0, page: 1, pageSize: 20, folderAvailable: true }
        : path === '/api/mailboxes/credentials/code' ? { challenge_id: 'a'.repeat(64), message: '验证码已发送到登录邮箱，10 分钟内有效。' }
        : path === '/api/mailboxes/credentials/reveal' ? { password: 'SampleMailPassword42!' }
        : path === '/api/mailboxes/credentials/change' ? (status = 'pending', { message: '已提交密码更新，邮局确认后生效。' })
        : path === '/api/site-settings' ? { brand: {}, weather: { enabled: false } } : {};
      await route.fulfill({ json: body });
    });
    await page.goto('http://127.0.0.1:4281/account/mailbox');
    await page.getByRole('heading', { name: '在邮件客户端使用' }).waitFor();
    for (const width of [390, 768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow at ${width}px`);
      await page.screenshot({ path: `.cache/mailbox-credentials-qa/mailbox-${width}.png`, fullPage: true, animations: 'disabled' });
    }
    await page.getByRole('button', { name: '查看并复制密码' }).click();
    await page.getByLabel('邮件验证码').fill('123456');
    await page.getByRole('button', { name: '验证并查看' }).click();
    assert.equal(await page.getByLabel('邮箱密码').getAttribute('type'), 'password');
    await page.getByRole('button', { name: '复制密码', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.__copies), ['SampleMailPassword42!']);
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    assert.equal(await page.getByLabel('邮箱密码').count(), 0);
    await page.getByRole('button', { name: '修改密码' }).click();
    await page.getByLabel('邮件验证码').fill('123456');
    await page.getByLabel('新邮箱密码').fill('ChangedMailPassword42!');
    await page.getByLabel('确认新密码').fill('ChangedMailPassword42!');
    await page.getByRole('button', { name: '验证并提交改密' }).click();
    await page.getByText('密码更新已提交，正在等待邮局确认。', { exact: false }).waitFor();
    assert.ok(await page.getByRole('button', { name: '查看并复制密码' }).isDisabled());
    assert.ok(calls.includes('/api/mailboxes/credentials/change'));
    assert.deepEqual(errors, []);
    console.log('PASS mailbox credential layout 390/768/1280/1440, OTP, copy, change and pending state.');
  } finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });

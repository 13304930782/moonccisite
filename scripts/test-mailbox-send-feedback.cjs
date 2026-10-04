const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const { preview } = await import('vite');
  const server = await preview({ preview: { host: '127.0.0.1', port: 4282, strictPort: true } });
  const browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'msedge' } : {}), headless: true });
  try {
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      let sends = 0;
      await page.route('**/api/**', async route => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === '/api/mailboxes/me' && sends) return route.fulfill({ status: 503, json: { message: 'Refresh failed fixture' } });
        const body = pathname === '/api/auth/me' ? { user: { id: 2, username: 'reader', email: 'reader@example.invalid', role: 'user', status: 'active' } }
          : pathname === '/api/mailboxes/me' ? { access: { status: 'active', mailbox_address: 'reader@mooncci.site', daily_limit: 10 } }
          : pathname === '/api/mailboxes/sent' ? { messages: [] }
          : pathname.startsWith('/api/mailboxes/folders/') ? { messages: [], total: 0, page: 1, pageSize: 25, folderAvailable: true }
          : pathname === '/api/mailboxes/send' ? (sends++, { message: '邮件已发送并保存到已发送。', savedToSent: true, id: 'fixture' })
          : pathname === '/api/site-settings' ? { brand: {}, weather: { enabled: false } } : {};
        await route.fulfill({ json: body });
      });
      await page.goto('http://127.0.0.1:4282/account/mailbox');
      await page.getByRole('button', { name: '写邮件', exact: true }).click();
      await page.getByLabel('收件人', { exact: true }).fill('target@example.invalid');
      await page.getByLabel('标题', { exact: true }).fill('Fixture');
      await page.getByLabel('正文', { exact: true }).fill('Fixture body');
      await page.getByRole('button', { name: '发送邮件', exact: true }).click();
      await page.getByText('发送记录暂未刷新，请稍后刷新查看。', { exact: true }).waitFor();
      assert.equal(await page.getByText('邮件已发送并保存到已发送。', { exact: true }).count(), 1);
      assert.equal(await page.getByText('Refresh failed fixture', { exact: true }).count(), 0);
      assert.equal(sends, 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.close();
    }
    console.log('PASS: SMTP success survives refresh failure at 390/1280px; one mocked send only.');
  } finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });

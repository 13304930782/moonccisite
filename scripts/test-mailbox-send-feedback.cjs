const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const { preview } = await import('vite');
  const server = await preview({ preview: { host: '127.0.0.1', port: 4282, strictPort: true } });
  const browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'msedge' } : {}), headless: true });
  try {
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      let sends = 0, accounts = 0, histories = 0, inboxes = 0, sentLists = 0;
      let rejectSend = false, holdInbox = false, releaseInbox;
      const inboxGate = new Promise(resolve => { releaseInbox = resolve; });
      let releaseHistory;
      const historyGate = new Promise(resolve => { releaseHistory = resolve; });
      const waterfall = [];
      await page.route('**/api/**', async route => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname.startsWith('/api/mailboxes')) waterfall.push({ path: pathname, at: Date.now() });
        if (pathname === '/api/mailboxes/me') accounts++;
        if (pathname === '/api/mailboxes/sent') { histories++; await historyGate; }
        if (pathname === '/api/mailboxes/folders/inbox') { inboxes++; if (holdInbox) { await inboxGate; return route.fulfill({ json: { messages: [{ uid: 1, subject: 'Stale inbox fixture', from: 'fixture', unread: false }], total: 1, page: 1, pageSize: 25, folderAvailable: true } }).catch(() => {}); } }
        if (pathname === '/api/mailboxes/send' && rejectSend) { sends++; return route.fulfill({ status: 502, json: { message: 'Uncertain fixture' } }); }
        if (pathname === '/api/mailboxes/folders/sent') { sentLists++; return route.fulfill({ status: 503, json: { message: 'Sent refresh failed fixture' } }); }
        const body = pathname === '/api/auth/session' ? { user: { id: 2, username: 'reader', email: 'reader@example.invalid', role: 'user', status: 'active' } }
          : pathname === '/api/mailboxes/me' ? { access: { status: 'active', mailbox_address: 'reader@mooncci.site', daily_limit: 10 } }
          : pathname === '/api/mailboxes/sent' ? { messages: [] }
          : pathname.startsWith('/api/mailboxes/folders/') ? { messages: [], total: 0, page: 1, pageSize: 25, folderAvailable: true }
          : pathname === '/api/mailboxes/send' ? (sends++, { message: '邮件已发送并保存到已发送。', savedToSent: true, id: 'fixture' })
          : pathname === '/api/site-settings' ? { brand: {}, weather: { enabled: false } } : {};
        await route.fulfill({ json: body });
      });
      await page.goto('http://127.0.0.1:4282/account/mailbox');
      await page.getByText('收件箱里还没有邮件。', { exact: true }).waitFor();
      assert.equal(inboxes, 1, 'Inbox must complete while unrelated history is still blocked');
      assert.equal(histories, 0, 'History stays lazy until expanded'); releaseHistory();
      await page.getByRole('button', { name: '写邮件', exact: true }).click();
      await page.getByLabel('收件人', { exact: true }).fill('target@example.invalid');
      await page.getByLabel('标题', { exact: true }).fill('Fixture');
      await page.getByLabel('正文', { exact: true }).fill('Fixture body');
      await page.getByRole('button', { name: '发送邮件', exact: true }).click();
      await page.getByText('服务暂时不可用，请稍后重试。', { exact: true }).waitFor();
      assert.equal(await page.getByText('邮件已发送并保存到已发送。', { exact: true }).count(), 1);
      assert.equal(await page.getByText('Refresh failed fixture', { exact: true }).count(), 0);
      assert.equal(sends, 1);
      assert.equal(accounts, 1, 'No account refresh after successful send');
      assert.equal(histories, 0, 'No history refresh after successful send');
      assert.equal(sentLists, 1, 'Exactly one Sent folder request');
      assert.equal(await page.getByText('Fixture', { exact: true }).count(), 1, 'Confirmed history row is retained');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      holdInbox = true;
      await page.getByRole('button', { name: '收件箱', exact: true }).click();
      await page.getByText('正在读取邮件…', { exact: true }).waitFor();
      await page.getByRole('button', { name: '已发送', exact: true }).click();
      releaseInbox();
      await page.getByText('服务暂时不可用，请稍后重试。', { exact: true }).waitFor();
      assert.equal(await page.getByText('Stale inbox fixture', { exact: true }).count(), 0);
      rejectSend = true;
      const sentBeforeFailure = sentLists;
      await page.getByRole('button', { name: '写邮件', exact: true }).click();
      await page.getByLabel('收件人', { exact: true }).fill('target@example.invalid');
      await page.getByLabel('标题', { exact: true }).fill('Uncertain draft');
      await page.getByLabel('正文', { exact: true }).fill('Keep this draft');
      await page.getByRole('button', { name: '发送邮件', exact: true }).click();
      await page.getByText('尚未确认操作结果，请先刷新或查看记录，确认后再重试。', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('正文', { exact: true }).inputValue(), 'Keep this draft');
      assert.equal(sends, 2); assert.equal(sentLists, sentBeforeFailure);
      assert.equal(await page.getByText('邮件已发送并保存到已发送。', { exact: true }).count(), 0);
      console.log(JSON.stringify({ viewport: width, waterfall }));
      await page.close();
    }
    console.log('PASS: inbox does not wait for history; send refreshes only Sent, success survives failure at 390/1280px.');
  } finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });

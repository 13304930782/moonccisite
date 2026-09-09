const assert = require('node:assert/strict');
const { chromium } = require('playwright');
async function main() {
  const { preview } = await import('vite');
  const server = await preview({ preview: { host: '127.0.0.1', port: 4193, strictPort: true } });
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const requests = []; page.on('request', req => requests.push(req.url()));
    const note = { id: 1, content: '浏览器测试近况正文', image_url: '', published_at: '2026-09-09' };
    let holdSettings = false, releaseSettings;
    let nowContent = '当前真实记录', latestNotes = true;
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      let body = {};
      if (url.pathname === '/api/settings/site') {
        if (holdSettings) await new Promise(r => { releaseSettings = r; });
        body = { brand: { nav_title: 'mooncci' }, hero: { title: '真实配置测试标题', subtitle: '测试配置副标题' }, footer: {} };
      } else if (url.pathname === '/api/auth/me') body = { user: { id: 1, username: 'fixture', role: 'owner' } };
      else if (url.pathname === '/api/now') body = { content: nowContent, updated_at: '2026-09-09' };
      else if (url.pathname === '/api/activity') {
        const update = { activity_id: 'u1', type: 'update', path: '/updates/1', title: '测试近况入口', excerpt: '一则记录', published_at: '2026-09-09' };
        const post = { activity_id: 'p1', type: 'post', path: '/article/1', title: '新文章动态入口', excerpt: '文章摘要', published_at: '2026-09-10' };
        const items = url.searchParams.get('type') === 'update' ? (latestNotes ? [update] : []) : (url.searchParams.get('scope') === 'home' ? [update] : [post, update]);
        body = { items, total: items.length, page: 1, pageSize: 6 };
      }
      else if (url.pathname === '/api/updates/1') body = note;
      else if (url.pathname.startsWith('/api/comments/')) body = [];
      else if (url.pathname === '/api/posts') body = [];
      else if (url.pathname === '/api/posts/1') body = { id: 1, title: '文章测试', content: '文章正文', tags: [] };
      else if (url.pathname === '/api/projects') body = { items: [], total: 0, page: 1, pageSize: 10 };
      else if (url.pathname === '/api/subscriptions/status') body = { available: false };
      else if (url.pathname === '/api/electricity/rooms') body = { data: [{ id: 'r1', name: '测试宿舍' }] };
      else if (url.pathname === '/api/electricity') {
        const history = Array.from({ length: 30 }, (_, i) => ({ snapshotDate: `2026-08-${String(i + 1).padStart(2,'0')}`, recordedAt: '2026-08-30T12:00:00Z', totalRemaining: 100-i, purchasedRemaining: 70, subsidyRemaining: 10, todayUse: 2, price: 0.5 }));
        body = { data: { current: history[29], history, dailyUsage: history.map(h => ({ usageDate: h.snapshotDate, usage: 2, method: 'school_daily', statusText: '' })), metrics: { averageDailyUse: 2, estimatedDaysRemaining: 20, balanceChange: -2, usageSampleDays: 7 }, status: 'normal', timezone: 'Asia/Shanghai' } };
      } else if (url.pathname.includes('weather')) body = { status: 'disabled', date: '2026-09-09', city: null, weather: null };
      else if (url.pathname.includes('/rss')) body = { data: { url: null, resetRequired: false } };
      await route.fulfill({ json: body });
    });
    await page.goto('http://127.0.0.1:4193');
    await page.getByRole('heading', { name: '真实配置测试标题' }).waitFor();
    assert.ok(!requests.some(url => /assets\/Admin.*\.js/.test(url)), 'homepage must not download admin routes');
    await page.locator('.activity-list').getByRole('link', { name: /新文章动态入口/ }).waitFor();
    await page.locator('.activity-list').getByRole('link', { name: /测试近况入口/ }).waitFor();
    assert.equal(await page.locator('.activity-row').first().getAttribute('href'), '/article/1');
    await page.locator('.now-panel').getByText('当前真实记录', { exact: true }).waitFor();
    assert.ok(!requests.some(url => url.includes('type=update&pageSize=1')), 'manual NOW must not fetch an automatic note');
    nowContent = '   '; await page.reload();
    await page.locator('.now-panel').getByRole('link', { name: '查看这条近况 ↗' }).waitFor();
    assert.equal(await page.locator('.now-panel').getByRole('link').getAttribute('href'), '/updates/1');
    await page.locator('.now-panel').getByText('一则记录', { exact: true }).waitFor();
    latestNotes = false; await page.reload();
    await page.locator('.now-panel').getByText('还没有发布近况。', { exact: true }).waitFor();
    nowContent = '当前真实记录'; latestNotes = true; await page.reload();
    await page.locator('.now-panel').getByText('当前真实记录', { exact: true }).waitFor();

    holdSettings = true; await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '真实配置测试标题' }).waitFor();
    holdSettings = false; releaseSettings?.();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.locator('.site-footer').getByRole('link', { name: '最近更新', exact: true }).click();
    await page.getByRole('heading', { name: '最近更新', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.scrollY), 0);
    await page.getByRole('link', { name: /测试近况入口/ }).click();
    await page.getByText('浏览器测试近况正文', { exact: true }).waitFor();
    assert.equal(await page.locator('.subscribe-section').count(), 0);
    assert.ok(requests.some(url => url.includes('/api/comments/update/1')));
    await page.goto('http://127.0.0.1:4193/article/1');
    await page.locator('.subscribe-section').waitFor();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('http://127.0.0.1:4193/electricity');
    await page.locator('.recharts-surface').waitFor();
    for (const days of [7,30]) {
      await page.getByRole('button', { name: `${days} 天`, exact: true }).click();
      await page.waitForFunction(days => document.querySelector('.electricity-chart')?.getAttribute('data-days') === String(days), days);
      const chart = page.locator('.electricity-chart');
      await chart.waitFor();
      const result = await chart.evaluate(el => { el.scrollLeft = 150; return { width: el.clientWidth, full: el.scrollWidth, left: el.scrollLeft, scrollbar: getComputedStyle(el).scrollbarWidth }; });
      assert.ok(result.full > result.width && result.left > 0, `mobile ${days}-day chart must scroll`);
      assert.ok(result.full >= (days === 30 ? 1320 : 560));
      assert.equal(result.scrollbar, 'none');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no page-wide overflow');
    }
    await page.screenshot({ path: '.cache/updates-mobile-chart.png', fullPage: false });
    await page.goto('http://127.0.0.1:4193/updates/1');
    await page.getByText('浏览器测试近况正文', { exact: true }).waitFor();
    await page.screenshot({ path: '.cache/updates-mobile-comments.png', fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: split routes, real settings snapshot, scroll reset, update comments, article subscription and mobile scroll charts.');
  } finally { await browser?.close(); await new Promise(r => server.httpServer.close(r)); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });

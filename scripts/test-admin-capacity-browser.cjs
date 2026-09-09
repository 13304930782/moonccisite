const assert = require('node:assert/strict');
const { chromium } = require('playwright');
async function main() {
  const { preview } = await import('vite');
  const server = await preview({ preview: { host: '127.0.0.1', port: 4194, strictPort: true } });
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    const page = await browser.newPage();
    const errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message));
    let releaseSlow;
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url()); requests.push(url.pathname + url.search);
      let body = {};
      if (url.pathname === '/api/auth/me') body = { user: { id: 1, username: 'capacity-owner', role: 'owner' } };
      else if (url.pathname === '/api/admin/stats') body = { posts: 125, users: 7, comments: 1001, bannedWords: 3 };
      else if (url.pathname === '/api/upload/media') {
        const q = url.searchParams.get('q'), num = Number(url.searchParams.get('page'));
        if (q === 'slow') await new Promise(r => { releaseSlow = r; });
        const name = q || `page-${num}`;
        body = { items: [{ filename: `${name}.png`, display_name: `media-${name}`, url: '/fixture.png', size: 100, size_text: '100 B', uploaded_at: '2026-09-09', status: 'active', ext: '.png' }], page: num, pageSize: 50, total: q ? 1 : 51 };
      } else if (url.pathname === '/api/admin/posts') {
        const num = Number(url.searchParams.get('page'));
        body = { items: [{ id: num, title: `post-page-${num}`, status: 'draft', author_name: 'fixture' }], page: num, pageSize: 50, total: 51 };
      }
      await route.fulfill({ json: body });
    });
    await page.goto('http://127.0.0.1:4194/admin');
    await page.getByText('1001', { exact: true }).waitFor();
    assert.ok(!requests.some(url => /^\/api\/admin\/(users|comments|posts|banned-words)(\?|$)/.test(url)), 'dashboard must not fetch lists for counts');
    await page.goto('http://127.0.0.1:4194/admin/media');
    await page.getByText('media-page-1', { exact: true }).waitFor();
    await page.getByRole('navigation', { name: '媒体库分页' }).getByRole('button', { name: '下一页' }).click();
    await page.getByText('media-page-2', { exact: true }).waitFor();
    const search = page.getByPlaceholder('搜索文件名、显示名、Alt...');
    await search.fill('slow');
    await page.waitForRequest(r => new URL(r.url()).searchParams.get('q') === 'slow');
    await search.fill('fast');
    await page.getByText('media-fast', { exact: true }).waitFor();
    releaseSlow();
    await page.waitForResponse(r => new URL(r.url()).searchParams.get('q') === 'slow');
    assert.equal(await page.getByText('media-fast', { exact: true }).count(), 1);
    assert.equal(await page.getByText('media-slow', { exact: true }).count(), 0);
    await page.goto('http://127.0.0.1:4194/admin/posts');
    await page.getByText('post-page-1', { exact: true }).waitFor();
    await page.getByRole('navigation', { name: '文章管理分页' }).getByRole('button', { name: '下一页' }).click();
    await page.getByText('post-page-2', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS: dashboard counts, media/post pagination, debounced search and stale response isolation.');
  } finally { await browser?.close(); await new Promise(r => server.httpServer.close(r)); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });

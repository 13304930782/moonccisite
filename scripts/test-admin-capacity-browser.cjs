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
    let pendingComments = 51;
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url()); requests.push(url.pathname + url.search);
      let body = {};
      if (url.pathname === '/api/auth/me') body = { user: { id: 1, username: 'capacity-owner', role: 'owner' } };
      else if (url.pathname === '/api/admin/stats') body = { posts: 125, users: 7, comments: 1001, bannedWords: 3 };
      else if (url.pathname === '/api/admin/users') {
        const keyword = url.searchParams.get('keyword') || '';
        if (keyword === 'slow-user') await new Promise(r => { releaseSlow = r; });
        const num = Number(url.searchParams.get('page'));
        body = { items: [{ id: num, username: keyword || `user-page-${num}`, email: 'fixture@example.test', role: 'user', status: 'active', can_comment: 1 }], page: keyword ? 1 : num, pageSize: 50, total: keyword ? 1 : 51 };
      } else if (url.pathname === '/api/admin/comments') {
        const num = Math.min(Number(url.searchParams.get('page')), Math.ceil(pendingComments / 50));
        body = { items: [{ id: num, content: `comment-page-${num}`, post_title: 'fixture article', author_name: 'fixture', status: 'pending', ip_address_masked: '203.0.*.*' }], page: num, pageSize: 50, total: pendingComments };
      } else if (url.pathname.startsWith('/api/admin/comments/') && route.request().method() === 'PUT') { pendingComments = 50; body = { message: 'fixture moderated' }; }
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
    await page.goto('http://127.0.0.1:4194/admin/users');
    await page.getByText('user-page-1', { exact: true }).waitFor();
    await page.getByRole('navigation', { name: '用户管理分页' }).getByRole('button', { name: '下一页' }).click();
    await page.getByText('user-page-2', { exact: true }).waitFor();
    await page.getByRole('textbox', { name: '搜索用户' }).fill('slow-user');
    const slowUserRequest = page.waitForRequest(r => new URL(r.url()).searchParams.get('keyword') === 'slow-user');
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await slowUserRequest;
    await page.getByRole('textbox', { name: '搜索用户' }).fill('fast-user');
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await page.getByText('fast-user', { exact: true }).waitFor();
    releaseSlow();
    await page.waitForResponse(r => new URL(r.url()).searchParams.get('keyword') === 'slow-user');
    assert.equal(await page.getByText('slow-user', { exact: true }).count(), 0);
    await page.goto('http://127.0.0.1:4194/admin/comments');
    await page.getByText('comment-page-1', { exact: true }).waitFor();
    await page.getByRole('navigation', { name: '评论管理分页' }).getByRole('button', { name: '下一页' }).click();
    await page.getByText('comment-page-2', { exact: true }).waitFor();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: '通过', exact: true }).click();
    await page.getByText('comment-page-1', { exact: true }).waitFor();
    await page.getByRole('combobox', { name: '筛选评论来源' }).click();
    const requestUpdate = page.waitForRequest(r => new URL(r.url()).searchParams.get('target') === 'update');
    await page.getByRole('option', { name: '近况评论', exact: true }).click();
    await requestUpdate;
    assert.deepEqual(errors, []);
    console.log('PASS: dashboard counts, media/post pagination, debounced search and stale response isolation.');
  } finally { await browser?.close(); await new Promise(r => server.httpServer.close(r)); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });

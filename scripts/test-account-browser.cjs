const assert = require('node:assert/strict');
const { chromium } = require('playwright');
async function main() {
  const { preview } = await import('vite');
  const server = await preview({ preview: { host: '127.0.0.1', port: 4196, strictPort: true } });
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let user = { id: 2, username: '测试读者', email: 'reader@example.test', role: 'user', status: 'active', can_comment: 1, version: 0 };
    let loggedIn = true;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let body = {};
      if (path === '/api/auth/me') body = { user: loggedIn ? { ...user, id: 1, role: 'owner' } : null };
      else if (path === '/api/auth/logout') { loggedIn = false; body = { message: '退出成功' }; }
      else if (path === '/api/admin/updates') body = {items:[],total:0,page:1,pageSize:20};
      else if (path === '/api/admin/users') body = { items: [user, { ...user, id: 3, username: 'long'.repeat(30), email: 'address'.repeat(20)+'@example.test' }], total: 2, page: 1, pageSize: 50 };
      else if (path === '/api/account' || path === '/api/admin/users/2/settings') {
        if (route.request().method() === 'PUT') { const data = route.request().postDataJSON(); assert.equal(data.version, user.version); user = { ...user, username: data.username, version: user.version + 1 }; }
        body = { user, message: '资料已保存。' };
      } else if (path === '/api/auth/connections') body = { providers: [{ provider: 'google', name: 'Google', enabled: true, bound: true }, { provider: 'qq', name: 'QQ', enabled: true, bound: false }] };
      else if (path === '/api/auth/providers') body = { providers: [] };
      await route.fulfill({ json: body });
    });
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      for (const [url, title] of [['/admin/users', '用户管理'], ['/admin/users/2/settings', '用户设置'], ['/account/settings', '个人设置']]) {
        await page.goto('http://127.0.0.1:4196' + url);
        await page.getByRole('heading', { name: title, exact: true }).waitFor();
        if (url === '/admin/users') await page.getByText('测试读者', { exact: true }).waitFor();
        else await page.getByLabel('用户名', { exact: true }).waitFor();
        if (url !== '/admin/users') {
          const labels = url.includes('/admin/') ? ['角色', '状态', '评论权限'] : ['确认身份的方式'];
          for (const dark of [false, true]) {
            await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
            for (const label of labels) {
              await page.getByRole('combobox', {name: label, exact: true}).click();
              await page.locator('.theme-select-menu').waitFor();
              assert.ok(await page.getByRole('option').count() > 0);
              await page.keyboard.press('Escape');
            }
          }
          await page.evaluate(() => document.documentElement.classList.remove('dark'));
        }
        const sizes = await page.evaluate(() => {
          const el = document.querySelector('.admin-main') || document.documentElement;
          return { width: el.clientWidth, scroll: el.scrollWidth, body: document.documentElement.scrollWidth, viewport: innerWidth };
        });
        assert.ok(sizes.scroll <= sizes.width + 1 && sizes.body <= sizes.viewport + 1, `${width} ${url}: horizontal overflow ${JSON.stringify(sizes)}`);
        if (width === 390) { require('node:fs').mkdirSync('.cache', { recursive: true }); await page.screenshot({path: '.cache/account-qa-' + url.replaceAll('/', '-') + '.png'}); }
        if (url === '/admin/users') assert.equal(await page.locator('table').count(), 0, 'mobile user management must not require a wide draggable table');
      }
    }
    await page.goto('http://127.0.0.1:4196/admin/updates');
    const statusSelect = page.getByRole('combobox', {name:'发布状态',exact:true});
    await statusSelect.waitFor();
    const alignment = await statusSelect.evaluate(el => {
      const box=el.getBoundingClientRect(), icon=el.querySelector('svg').getBoundingClientRect();
      return {right:box.right-icon.right, middle:Math.abs((box.top+box.bottom-icon.top-icon.bottom)/2)};
    });
    assert.ok(alignment.right < 24 && alignment.middle < 2, JSON.stringify(alignment));
    await page.goto('http://127.0.0.1:4196/account/settings');
    await page.getByLabel('用户名', { exact: true }).fill('修改后的名字');
    await page.getByRole('button', { name: '保存资料', exact: true }).click();
    await page.getByText('资料已保存。', { exact: true }).waitFor();
    assert.equal(user.username, '修改后的名字');
    await page.getByRole('button', { name: '换绑', exact: true }).isDisabled().then(x => assert.ok(x));
    await page.getByRole('button', { name: '退出登录', exact: true }).click();
    await page.waitForURL('**/login');
    assert.equal(loggedIn, false); assert.deepEqual(errors, []);
    console.log('PASS: mobile and desktop settings fit viewport; profile save, binding guard and logout work.');
  } finally { await browser?.close(); await server.httpServer.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });

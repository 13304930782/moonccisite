const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { chromium } = require('playwright');
const { catalog, defaults, validate, evaluate } = require('../server/src/lib/festivals');

(async () => {
  const { preview } = await import('vite');
  const server = await preview({ preview: { host: '127.0.0.1', port: 4997, strictPort: true }, logLevel: 'error' });
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    const now = Date.parse('2026-11-02T12:00:00+08:00');
    let config = defaults(), failSave = false;
    const errors = [], writes = [], requests = [];
    async function makePage(role) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://status.mooncci.site/**', route => route.fulfill({ contentType: 'text/html', body: `<p style="margin:0;color:${new URL(route.request().url()).searchParams.get('theme') === 'dark' ? '#eee' : '#222'}">All services are online</p>` }));
      await page.route('**/api/**', async route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        requests.push({ role, path, method: request.method() });
        let body = { items: [], total: 0 };
        if (path === '/api/auth/session' || path === '/api/account') {
          body = { user: { id: 1, username: 'Test admin', email: 'test@example.invalid', role, status: 'active', version: 1 } };
        } else if (path === '/api/settings/site') {
          body = { brand: {}, hero: {}, footer: {}, weather: { enabled: false } };
        } else if (path.startsWith('/api/settings/festivals')) {
          if (path !== '/api/settings/festivals/active' && !['owner', 'admin'].includes(role)) {
            return route.fulfill({ status: 403, json: { message: '需要管理员权限' } });
          }
          if (path === '/api/settings/festivals/preview') {
            const input = request.postDataJSON(), at = Date.parse(input.at);
            const draft = input.config ? validate(input.config, now, false) : structuredClone(config);
            if (input.festivalId) {
              assert.ok(catalog.some(item => item.id === input.festivalId && item.implemented));
              draft.mode = 'manual';
              draft.manual = { id: input.festivalId, expiresAt: new Date(at + 86400000).toISOString() };
            }
            body = evaluate(draft, at);
          } else if (path === '/api/settings/festivals/active') {
            const { modules, ...state } = evaluate(config, now);
            body = state;
          } else {
            if (request.method() === 'PUT') {
              writes.push(request.postDataJSON());
              if (failSave) return route.fulfill({ status: 500, json: { message: '测试保存失败' } });
              config = validate(request.postDataJSON(), now);
            }
            body = { config, catalog, state: evaluate(config, now) };
          }
        } else if (path === '/api/publishing/config' || path === '/api/engagement/config') body = { enabled: true };
        else if (path === '/api/engagement/notifications/unread') body = { unread: 0 };
        else if (path === '/api/admin/stats') body = { posts: 0, users: 1, comments: 0, bannedWords: 0 };
        else if (['/api/posts', '/api/categories', '/api/tags'].includes(path)) body = [];
        await route.fulfill({ json: body });
      });
      return page;
    }
    const page = await makePage('owner');
    const go = path => page.goto(`http://127.0.0.1:4997${path}`);
    const row = () => page.getByRole('button', { name: '编辑万圣节排期', exact: true });
    const save = () => page.getByRole('button', { name: '保存节日设置', exact: true });
    const noOverflow = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
    const theme = async mode => {
      if (await page.evaluate(() => document.documentElement.dataset.moonTheme) !== mode) {
        await page.locator('button[aria-label="切换深色主题"]:visible,button[aria-label="切换浅色主题"]:visible,button[aria-label="切换外观"]:visible').first().click();
        await page.waitForFunction(value => document.documentElement.dataset.moonTheme === value, mode);
      }
    };
    const noTheme = async () => {
      await page.waitForFunction(() => !document.documentElement.classList.contains('halloween') && !document.querySelector('[data-halloween]'));
      assert.equal(await page.getByRole('complementary', { name: '节日预览' }).count(), 0);
    };
    await fs.mkdir('.cache/festivals-qa', { recursive: true });

    await go('/admin/festivals');
    await row().waitFor();
    assert.ok(await page.locator('.admin-sidebar').getByRole('link', { name: '节日管理', exact: true }).isVisible());
    assert.equal(await page.getByRole('radio', { name: '自动', exact: true }).getAttribute('aria-checked'), 'true');
    await page.getByRole('radio', { name: '全部关闭', exact: true }).click();
    await save().waitFor();
    await page.getByRole('button', { name: '放弃', exact: true }).click();
    assert.equal(await page.getByRole('radio', { name: '自动', exact: true }).getAttribute('aria-checked'), 'true');
    await row().click();
    assert.ok(await page.getByRole('dialog').getByRole('checkbox', { name: /其他页面轻装饰/ }).isDisabled());
    await page.getByRole('dialog').getByLabel('优先级（越大越优先）', { exact: true }).fill('123');
    await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click();
    failSave = true;
    await save().click();
    await page.getByRole('alert').filter({ hasText: '尚未确认操作结果' }).waitFor();
    await row().click();
    assert.equal(await page.getByRole('dialog').getByLabel('优先级（越大越优先）', { exact: true }).inputValue(), '123');
    await page.getByRole('button', { name: '关闭编辑排期', exact: true }).click();
    failSave = false;
    await save().click();
    await page.getByText('已保存', { exact: true }).waitFor();
    assert.equal(config.modules.halloween.priority, 123);
    assert.equal(writes.length, 2);
    await page.reload();
    await row().click();
    assert.equal(await page.getByRole('dialog').getByLabel('优先级（越大越优先）', { exact: true }).inputValue(), '123');
    await page.getByRole('button', { name: '关闭编辑排期', exact: true }).click();

    for (const width of [375, 768, 1024, 1280]) for (const mode of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 1000 });
      await theme(mode);
      await page.locator('.admin-main').evaluate(element => { element.scrollTop = 0; });
      await noOverflow();
      await page.screenshot({ path: `.cache/festivals-qa/admin-${width}-${mode}.png`, fullPage: true });
    }

    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.getByLabel('模拟时间（上海）', { exact: true }).fill('2026-10-31T12:00');
    await page.getByRole('button', { name: '打开预览', exact: true }).click();
    await page.getByRole('complementary', { name: '节日预览' }).waitFor();
    await page.locator('.hw-scene').waitFor().catch(async error => {
      await page.screenshot({ path: '.cache/festivals-qa/preview-failure.png', fullPage: true });
      console.error(await page.evaluate(() => ({ htmlClass: document.documentElement.className, theme: [...document.querySelectorAll('[data-halloween]')].map(e => e.outerHTML.slice(0, 250)), session: sessionStorage.getItem('mooncci-festival-preview') })), requests.filter(item => item.path.includes('festivals')).slice(-5), errors);
      throw error;
    });
    assert.equal(writes.length, 2, 'preview must not persist configuration');
    assert.ok(await page.evaluate(() => document.documentElement.classList.contains('halloween')));
    await page.getByRole('button', { name: '关闭节日装饰', exact: true }).click();
    await page.locator('.hw-scene').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => localStorage.getItem('mooncci-halloween')), 'off');
    await page.reload();
    await page.getByRole('button', { name: '开启节日装饰', exact: true }).waitFor();
    assert.equal(await page.locator('.hw-scene').count(), 0);
    await page.getByRole('button', { name: '开启节日装饰', exact: true }).click();
    await page.locator('.hw-scene').waitFor();

    for (const width of [375, 768, 1024, 1280]) for (const mode of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 1000 });
      await theme(mode);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await noOverflow();
      const controls = await page.locator('.festival-controls').boundingBox();
      const status = await page.locator('.footer-status').boundingBox();
      assert.ok(controls && status && (controls.y + controls.height <= status.y || status.y + status.height <= controls.y), 'festival controls overlap service status');
      await page.screenshot({ path: `.cache/festivals-qa/home-footer-${width}-${mode}.png` });
    }
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('link', { name: '文章', exact: true }).click();
    await page.waitForURL('**/articles');
    await noTheme();
    await page.locator('.site-header .site-brand').click();
    await page.locator('.hw-scene').waitFor();
    await page.locator('.header-account summary').click();
    await page.getByRole('link', { name: '控制台', exact: true }).click();
    await page.waitForURL('**/admin');
    await noTheme();

    const admin = await makePage('admin');
    await admin.goto('http://127.0.0.1:4997/admin/festivals');
    await admin.getByRole('button', { name: '编辑万圣节排期', exact: true }).waitFor();
    assert.ok(await admin.locator('.admin-sidebar').getByRole('link', { name: '节日管理', exact: true }).isVisible());
    const editor = await makePage('editor');
    await editor.goto('http://127.0.0.1:4997/admin');
    await editor.locator('.admin-sidebar').waitFor();
    assert.equal(await editor.getByRole('link', { name: '节日管理', exact: true }).count(), 0);
    await editor.goto('http://127.0.0.1:4997/admin/festivals');
    await editor.getByRole('heading', { name: '当前账号无法访问此页面', exact: true }).waitFor();
    assert.equal(requests.filter(item => item.role === 'editor' && item.path.startsWith('/api/settings/festivals')).length, 0);
    assert.equal(requests.filter(item => item.role === 'admin' && /festivals\/(active|preview)$/.test(item.path) && item.method === 'GET').length, 0);
    assert.deepEqual(errors, []);
    console.log('PASS: owner/admin entry, editor denial, edit/discard/save/reload, failed save retention, private home preview, off preference, navigation cleanup, footer separation and 4 widths in light/dark.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.httpServer.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { chromium } = require('playwright');
(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 4995, strictPort: true }, logLevel: 'error' });
  await server.listen();
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    const page = await browser.newPage({locale:'zh-CN', reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let role='owner', features=true;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let body = {};
      if (path === '/api/auth/session') body = { user: { id: 1, username: 'Preview', email: 'preview@example.invalid', role, status: 'active' } };
      if (path === '/api/settings/site') body = { brand: {}, hero: {}, footer: {}, weather: { enabled: false } };
      if (path.endsWith('/config') || path === '/account/security-config') body = { enabled: features };
      if (path === '/api/admin/stats') body = { posts: 10, users: 3, comments: 5, bannedWords: 0 };
      await route.fulfill({ json: body });
    });
    await fs.mkdir('.cache/admin-workspace-qa', { recursive: true });
    for (const width of [1920, 1280, 1024, 768, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('http://127.0.0.1:4995/admin');
      await page.locator('.admin-quick-links').waitFor();
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => { document.documentElement.dataset.moonTheme = theme; document.documentElement.classList.toggle('dark', theme === 'dark'); }, theme);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width} overflow`);
        await page.screenshot({ path: `.cache/admin-workspace-qa/overview-${width}-${theme}.png` });
      }
      const mobile = width < 1024;
      if (mobile) await page.getByRole('button', { name: '打开后台菜单' }).click();
      const navigation = page.locator(mobile ? '.admin-mobile-layer nav' : '.admin-sidebar nav');
      const links = navigation.locator('a');
      assert.ok(await links.count() > 20);
      assert.equal(await navigation.locator('a[aria-current="page"]').count(), 1, `${width} current page`);
      const inspected = new Set();
      const inspectVisibleLinks = async () => {
        const visible = await navigation.locator('a:visible').evaluateAll(nodes => nodes.map(node => ({href:node.getAttribute('href'),height:node.getBoundingClientRect().height,text:node.textContent})));
        assert.ok(visible.length > 0, `${width} visible navigation`);
        assert.deepEqual(visible.filter(link => link.height < 44), [], `${width} touch targets`);
        visible.forEach(link => inspected.add(link.href));
      };
      const toggles = navigation.locator('.admin-nav-group-toggle');
      for (const toggle of await toggles.all()) if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
      await inspectVisibleLinks();
      const opened = [], limit = mobile ? 1 : 2;
      for (const toggle of await toggles.all()) {
        const panelId = await toggle.getAttribute('aria-controls');
        const panel = navigation.locator(`[id="${panelId}"]`);
        assert.equal(await panel.count(), 1, `${width} group control target`);
        assert.equal(await panel.isVisible(), false, `${width} collapsed group`);
        await toggle.click(); await panel.waitFor({state:'visible'}); opened.push(panelId);
        const expanded = await toggles.evaluateAll(nodes => nodes.filter(node => node.getAttribute('aria-expanded') === 'true').map(node => node.getAttribute('aria-controls')));
        assert.deepEqual(expanded, opened.slice(-limit), `${width} only the latest ${limit} group(s) stay open`);
        await inspectVisibleLinks();
      }
      assert.equal(inspected.size, await links.count(), `${width} every permitted destination was opened and checked`);
      const distinct = await navigation.locator('a svg').evaluateAll(nodes => new Set(nodes.map(node => node.innerHTML)).size);
      assert.ok(distinct >= 20, `${width} semantic icons`);
      if (mobile) {
        await page.keyboard.press('Escape'); await page.locator('.admin-mobile-layer').waitFor({ state: 'hidden' });
        assert.equal(await page.getByRole('button', {name:'打开后台菜单'}).evaluate(node => node === document.activeElement), true, `${width} menu restores focus`);
      }
    }
    await page.setViewportSize({width:1280,height:900});
    for (const nextRole of ['owner','admin','editor']) {
      role=nextRole;
      await page.goto('http://127.0.0.1:4995/admin');await page.locator('.admin-quick-links').waitFor();
      const links=await page.locator('.admin-sidebar .admin-menu a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));
      assert.equal(new Set(links).size,links.length,'menu destinations are unique');
      assert.ok(links.includes('/admin/posts'));
      assert.equal(await page.locator('.admin-sidebar .admin-nav-write[href="/admin/write"]').isVisible(),true,'writing remains a direct header action');
      assert.equal(links.includes('/admin/node-monitor'),role==='owner');
      assert.equal(links.includes('/admin/users'),role!=='editor');
      assert.equal(links.includes('/admin/reviews'),role!=='editor');
      assert.ok(await page.locator('.admin-quick-links a').count()<=3);
      assert.equal(await page.locator('h1').count(),1);
    }
    role='owner';features=false;
    await page.goto('http://127.0.0.1:4995/admin');await page.locator('.admin-quick-links').waitFor();
    assert.equal(await page.locator('.admin-sidebar a[href="/admin/reviews"]').count(),0);
    assert.equal(await page.locator('.admin-sidebar a[href="/admin/operations"]').count(),0);
    role='user';await page.goto('http://127.0.0.1:4995/admin');
    await page.getByRole('heading',{name:'当前账号无法访问此页面'}).waitFor();
    assert.equal(await page.locator('.admin-sidebar').count(),0);
    assert.deepEqual(errors, []);
    console.log('PASS: admin overview five widths, light/dark, navigation targets, semantic icons, mobile menu and Escape.');
  } finally { if (browser) await browser.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

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
      if (width === 375) await page.getByRole('button', { name: '打开后台菜单' }).click();
      const navigation = page.locator(width === 375 ? '.admin-mobile-layer nav' : '.admin-sidebar nav');
      await navigation.locator('details').evaluateAll(nodes => nodes.forEach(node => { node.open = true; }));
      const links = navigation.locator('a');
      assert.ok(await links.count() > 20);
      assert.ok(await links.evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().height >= 44)), `${width} touch targets: ${JSON.stringify(await links.evaluateAll(nodes => nodes.filter(n => n.getBoundingClientRect().height < 44).map(n => ({text:n.textContent,height:n.getBoundingClientRect().height}))))}`);
      const distinct = await navigation.locator('a svg').evaluateAll(nodes => new Set(nodes.map(node => node.innerHTML)).size);
      assert.ok(distinct >= 20, `${width} semantic icons`);
      if (width === 375) { await page.keyboard.press('Escape'); await page.locator('.admin-mobile-layer').waitFor({ state: 'hidden' }); }
    }
    await page.setViewportSize({width:1280,height:900});
    for (const nextRole of ['owner','admin','editor']) {
      role=nextRole;
      await page.goto('http://127.0.0.1:4995/admin');await page.locator('.admin-quick-links').waitFor();
      const links=await page.locator('.admin-sidebar .admin-menu-group a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));
      assert.equal(new Set(links).size,links.length,'menu destinations are unique');
      assert.ok(links.includes('/admin/posts')&&links.includes('/admin/write'));
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

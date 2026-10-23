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
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let body = {};
      if (path === '/api/auth/session') body = { user: { id: 1, username: 'Preview', email: 'preview@example.invalid', role: 'owner', status: 'active' } };
      if (path === '/api/settings/site') body = { brand: {}, hero: {}, footer: {}, weather: { enabled: false } };
      if (path.endsWith('/config')) body = { enabled: true };
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
    assert.deepEqual(errors, []);
    console.log('PASS: admin overview five widths, light/dark, navigation targets, semantic icons, mobile menu and Escape.');
  } finally { if (browser) await browser.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

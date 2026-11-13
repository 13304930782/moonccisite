const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    const samples = [
      { locale: 'zh-CN', primary: '阅读文章', secondary: '浏览分类' },
      { locale: 'en', primary: 'Read articles', secondary: 'Browse categories' },
      { locale: 'en', custom: true, primary: '自定义入口', secondary: '另一个入口' },
      { locale: 'en', published: true, primary: 'Published text', secondary: 'Published categories' },
    ];
    for (const sample of samples) {
      const page = await browser.newPage({ locale: sample.locale });
      await page.addInitScript(locale => localStorage.setItem('mooncci:language', JSON.stringify({ preference: locale, version: Date.now() })), sample.locale);
      await page.route('**/api/**', route => {
        const url = new URL(route.request().url());
        const settings = { brand: {}, footer: {}, content_locale: sample.published ? 'en' : 'zh-CN', hero: {
          eyebrow: 'mooncci / 个人技术手记', title: 'Explore the Programming.', subtitle: '分享前端、后端、算法、系统设计等计算机领域的知识与经验',
          primary_text: sample.custom ? '自定义入口' : sample.published ? 'Published text' : '阅读文章',
          secondary_text: sample.custom ? '另一个入口' : sample.published ? 'Published categories' : '浏览分类',
          primary_link: '/articles', secondary_link: '/categories',
        } };
        return route.fulfill({ json: url.pathname === '/api/settings/site' ? settings : url.pathname === '/api/posts' ? [] : { items: [], total: 0 } });
      });
      await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/${sample.locale === 'en' ? 'en' : ''}`);
      const links = page.locator('.home-hero-actions a');
      await page.waitForFunction(expected => document.querySelector('.home-hero-actions a')?.textContent?.includes(expected), sample.primary);
      assert.match(await links.nth(0).innerText(), new RegExp(sample.primary));
      assert.match(await links.nth(1).innerText(), new RegExp(sample.secondary));
      if (sample.locale === 'en' && !sample.custom && !sample.published) {
        assert.match(await page.locator('.hero-description').innerText(), /Sharing knowledge/);
        assert.match(await page.locator('.hero-copy .eyebrow').innerText(), /Personal tech notes/);
      }
      await page.close();
    }
    console.log('Home hero locale fallback: PASS');
  } finally { await browser?.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

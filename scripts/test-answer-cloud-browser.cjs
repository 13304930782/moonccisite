const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');

(async () => {
  const { createServer } = await import('vite');
  const server = await createServer({ server: { host: '127.0.0.1', port: 0, fs: { allow: [process.cwd(), path.resolve(process.cwd(), '..')] } }, logLevel: 'error' });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
    const cases = [
      [{ text: '咖啡', count: 6 }],
      [{ text: '咖啡', count: 6 }, { text: '音乐', count: 5 }, { text: '朋友', count: 4 }, { text: '阳光', count: 3 }, { text: '散步', count: 2 }],
      [{ text: '咖啡', count: 8 }, { text: 'music', count: 7 }, { text: '朋友', count: 6 }, { text: 'sunshine', count: 5 }, { text: '散步', count: 4 }, { text: '阅读', count: 3 }, { text: 'tea', count: 2 }, { text: '猫咪', count: 1 }],
      [{ text: 'Supercalifragilistic', count: 9 }, { text: '音乐', count: 3 }],
      Array.from({ length: 30 }, (_, index) => ({ text: `词${index + 1}`, count: 30 - index })),
    ];
    for (const words of cases) for (const width of [320, 375]) {
      console.log(`Checking ${words.length} words at ${width}px`);
      const page = await browser.newPage({ locale: 'zh-CN', viewport: { width, height: 812 } });
      page.on('pageerror', error => console.error('Browser error:', error));
      let answered = false;
      await page.route('**/api/**', async route => {
        const url = new URL(route.request().url()), method = route.request().method();
        let json = { items: [], total: 0 };
        if (url.pathname === '/api/settings/site') json = { brand: {}, hero: {}, footer: {} };
        if (['/api/posts', '/api/categories', '/api/tags'].includes(url.pathname)) json = [];
        if (url.pathname === '/api/auth/session') return route.fulfill({ status: 401, json: { message: 'not logged in' } });
        if (url.pathname === '/api/weather-mood') json = { data: { status: 'needs_location', mode: 'weather', refreshAt: '2099-01-01T00:00:00Z' } };
        if (url.pathname === '/api/weather-mood/interactions') json = { data: { date: '2026-11-12', pets: 0, hits: 0 } };
        if (url.pathname === '/api/daily-question') json = { active: true, id: 1, text: '今天想做什么？', choices: null, answered };
        if (url.pathname === '/api/daily-question/summary') json = { summary: null };
        if (url.pathname === '/api/daily-question/answers' && method === 'POST') { answered = true; json = { accepted: true, preview: { type: 'wordcloud', total: 9, words } }; }
        await route.fulfill({ json });
      });
      await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
      await page.locator('.weather-companion-ball').click();
      const card = page.locator('.daily-question-card');
      await card.locator('textarea').fill('今天的回答');
      await card.getByRole('button', { name: '提交回答' }).click();
      await page.locator('.answer-cloud-word').first().waitFor({ state: 'visible' });
      await page.waitForTimeout(400);
      const result = await page.locator('.answer-cloud').evaluate(root => {
        const bounds = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
        return { root: bounds(root), words: [...root.querySelectorAll('.answer-cloud-word')].map(node => ({ box: bounds(node), count: bounds(node.querySelector('small')), countSize: parseFloat(getComputedStyle(node.querySelector('small')).fontSize), countOpacity: getComputedStyle(node.querySelector('small')).opacity, size: parseFloat(getComputedStyle(node).fontSize), text: node.querySelector('.answer-cloud-text').textContent, countText: node.querySelector('small').textContent })) };
      });
      assert.equal(result.words.length, words.length);
      assert.equal(result.words[0].text, words[0].text);
      assert.equal(result.words[0].size, 40);
      if (words.length > 1) assert.equal(result.words.at(-1).size, 14);
      assert.ok(Math.abs((result.words[0].box.x + result.words[0].box.width / 2) - (result.root.x + result.root.width / 2)) < 1);
      assert.ok(Math.abs((result.words[0].box.y + result.words[0].box.height / 2) - (result.root.y + result.root.height / 2)) < 1);
      for (const [i, word] of result.words.entries()) {
        assert.ok(word.box.x >= result.root.x - 1 && word.box.right <= result.root.right + 1 && word.box.y >= result.root.y - 1 && word.box.bottom <= result.root.bottom + 1, `outside container: ${word.text}`);
        assert.equal(word.countText, String(words[i].count));
        assert.ok(Math.abs(word.countSize / word.size - .55) < .01 && word.countOpacity === '0.4', `count style: ${word.text}`);
        assert.ok(word.count.x >= word.box.x && word.count.right <= word.box.right + 1, `count clipped: ${word.text}`);
        for (const other of result.words.slice(i + 1)) assert.ok(word.box.right <= other.box.x + 1 || other.box.right <= word.box.x + 1 || word.box.bottom <= other.box.y + 1 || other.box.bottom <= word.box.y + 1, `overlap: ${word.text} / ${other.text}`);
      }
      if (words.length === 5 && width === 320) {
        await page.setViewportSize({ width: 375, height: 812 });
        await page.waitForFunction(() => { const root = document.querySelector('.answer-cloud'), first = root?.querySelector('.answer-cloud-word'); if (!root || !first) return false; const a = root.getBoundingClientRect(), b = first.getBoundingClientRect(); return a.width > 280 && Math.abs(a.x + a.width / 2 - b.x - b.width / 2) < 1; });
        const overlaps = await page.locator('.answer-cloud').evaluate(root => { const words = [...root.querySelectorAll('.answer-cloud-word')].map(node => node.getBoundingClientRect()); return words.some((a, index) => words.slice(index + 1).some(b => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1)); });
        assert.equal(overlaps, false, 'words remain separate after viewport resize');
      }
      if (words.length === 5 && width === 375) await page.screenshot({ path: '.cache/answer-cloud-preview.png' });
      await page.close();
    }
    console.log('PASS: centered 1/5/8/30-word clouds, Chinese and English measurement, long-word count, boundaries and collisions at 320/375px');
  } finally { await browser?.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

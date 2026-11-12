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
    const page = await browser.newPage({ locale: 'zh-CN' });
    await page.clock.install({ time: new Date('2026-11-13T02:00:00Z') });
    const requests = [];
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url());
      const date = url.searchParams.get('date') || url.pathname.split('/')[4];
      const question = { id: 1, question_date: date, text: '测试题目', choices: null, status: 'published', answer_count: 2, summary_status: 'none' };
      if (url.pathname.endsWith('/generate')) requests.push({ date, method: route.request().method() });
      const json = url.pathname === '/api/admin/daily-questions' ? { items: [], question } : url.pathname.endsWith('/generate') ? { question } : {};
      await route.fulfill({ json });
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
    await page.evaluate(async () => {
      const React = await import('/node_modules/.vite/deps/react.js');
      const reactDom = await import('/node_modules/.vite/deps/react-dom_client.js');
      const { AdminDailyQuestions } = await import('/src/app/components/AdminDailyQuestions.tsx');
      document.body.innerHTML = '<div id="daily-test-root"></div>';
      (reactDom.createRoot || reactDom.default.createRoot)(document.getElementById('daily-test-root')).render((React.createElement || React.default.createElement)(AdminDailyQuestions));
    });
    const date = page.locator('input[type=date]');
    await date.waitFor();
    const generate = page.getByRole('button', { name: '生成总结' });
    await generate.waitFor();
    assert.equal(await generate.isDisabled(), true, 'future question cannot generate a summary');
    await date.fill('2026-11-12');
    await page.waitForFunction(() => document.querySelector('input[type=date]')?.value === '2026-11-12' && [...document.querySelectorAll('button')].some(button => button.textContent.trim() === '生成总结' && !button.disabled));
    assert.equal(await generate.isEnabled(), true, 'previous day remains available for regeneration');
    await Promise.all([page.waitForResponse(response => response.url().endsWith('/api/admin/daily-questions/2026-11-12/generate')), generate.click()]);
    assert.deepEqual(requests, [{ date: '2026-11-12', method: 'POST' }]);
    console.log('PASS: past question summary can be regenerated; future question stays disabled');
  } finally { await browser?.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

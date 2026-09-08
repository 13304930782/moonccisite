const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const express = require('../server/node_modules/express');
const bcrypt = require('../server/node_modules/bcryptjs');
async function main() {
  process.env.JWT_SECRET = 'browser-regression-secret-only-32-chars';
  process.env.COOKIE_SECURE = 'false';
  process.env.COOKIE_DOMAIN = '';
  const db = require('../server/src/db');
  const revoked = new Set();
  const user = { id: 1, username: 'browser-fixture', email: 'browser@example.test', role: 'owner', status: 'active', password_hash: await bcrypt.hash('BrowserPassword1', 4) };
  db.query = async (sql, params) => {
    if (sql.startsWith('INSERT IGNORE INTO auth_revocations')) { revoked.add(params[0]); return [{}]; }
    if (sql.includes('FROM users')) return [revoked.has(params?.[1]) ? [] : [user]];
    return [{}];
  };
  const api = express(); api.use(express.json());
  api.use('/api/auth', require('../server/src/routes/auth-cookie'));
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { host: '127.0.0.1', port: 4192, strictPort: true },
    plugins: [{ name: 'browser-test-api', configureServer(server) { server.middlewares.use(api); } }] });
  let browser;
  try {
    await vite.listen();
    browser = await chromium.launch({ headless: true, ...(process.env.TEST_CHROME_PATH ? { executablePath: process.env.TEST_CHROME_PATH } : {}) });
    const context = await browser.newContext();
    const errors = [];
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    const url = 'http://127.0.0.1:4192/test/browser/harness.html';
    await page.goto(url);
    await page.waitForFunction(() => document.querySelector('[data-testid=user]')?.textContent === 'anonymous');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid=user]')?.textContent === 'browser-fixture');
    assert.ok((await context.cookies()).some(cookie => cookie.name === 'mooncci_token' && cookie.httpOnly));
    await page.locator('.toastui-editor-ww-container .ProseMirror').waitFor();
    assert.equal(await page.evaluate(() => window.__xss), undefined);
    assert.equal(await page.locator('.toastui-editor-ww-container script, .toastui-editor-ww-container [onerror]').count(), 0);
    await page.locator('.toastui-editor-ww-container .ProseMirror').click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type(' editor round trip');
    await page.waitForFunction(() => document.querySelector('[data-testid=markdown]')?.textContent?.includes('editor round trip'));
    const second = await context.newPage(); await second.goto(url);
    await second.waitForFunction(() => document.querySelector('[data-testid=user]')?.textContent === 'browser-fixture');
    await page.route('**/api/auth/logout', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html>proxy fallback' }));
    await page.getByRole('button', { name: 'Logout', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '退出登录未完成' }).waitFor();
    assert.equal(await page.getByTestId('user').textContent(), 'browser-fixture');
    await page.unroute('**/api/auth/logout');
    await page.getByRole('button', { name: 'Logout', exact: true }).click();
    for (const tab of [page, second]) await tab.waitForFunction(() => document.querySelector('[data-testid=user]')?.textContent === 'anonymous');
    assert.ok(!(await context.cookies()).some(cookie => cookie.name === 'mooncci_token'));
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[data-testid=user]')?.textContent === 'anonymous');
    assert.deepEqual(errors, []);
    console.log('Browser checks passed: HttpOnly cookie, failed logout, cross-tab logout, reload, editor sanitization and editing.');
  } finally { await browser?.close(); await vite.close(); await db.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

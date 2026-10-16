const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { installFixtures, testFlow, settledSend, holdResponse } = require('./fixtures/round2-mail.cjs');

async function failureFlow(page, origin, candidate, fixture) {
  for (const id of ['mail-to', 'mail-subject', 'mail-body']) if (await page.locator('#' + id).count()) await page.locator('#' + id).fill('');
  fixture.failList = true; await page.goto(origin + '/account/mailbox'); await page.locator('.mailbox-error').waitFor();
  const result = { initialErrorCorrect: !(await page.getByText('邮局尚未提供已发送文件夹。你仍可正常收发邮件。', { exact: true }).count()) };
  if (candidate) assert(result.initialErrorCorrect);
  await page.waitForTimeout(350); fixture.failList = false;
  await page.locator('.mailbox-folder-head').getByRole('button', { name: '刷新', exact: true }).click();
  const rows = page.locator('.mailbox-letter-list button'); await rows.first().waitFor();
  fixture.failDetail = true; await rows.nth(1).click(); await page.locator('.mailbox-error').waitFor();
  result.explicitDetailRetry = !!(await page.getByRole('button', { name: '重试读取邮件', exact: true }).count());
  if (candidate) assert(result.explicitDetailRetry);
  await page.waitForTimeout(350); fixture.failDetail = false;
  if (candidate) await page.getByRole('button', { name: '重试读取邮件', exact: true }).click(); else await rows.nth(1).click();
  await page.locator('.mailbox-letter-detail h3').waitFor();
  await page.getByRole('button', { name: '回复', exact: true }).click();
  await page.locator('#mail-body').fill('仅隔离适配器模拟发送，超时必须核对。');
  fixture.failSend = true; const start = fixture.writes.length;
  await page.getByRole('button', { name: '发送邮件', exact: true }).click();
  await settledSend(page);
  assert.equal(await page.locator('#mail-body').inputValue(), '仅隔离适配器模拟发送，超时必须核对。');
  assert.equal(fixture.writes.length - start, 1, 'No automatic resend after uncertainty');
  result.noAutoRetry = true;
  await page.locator('.mailbox-form-footer button').click();
  if (candidate) await page.getByRole('alertdialog').waitFor(); else await settledSend(page);
  result.uncertainGuard = fixture.writes.length - start === 1 && await page.getByRole('alertdialog').count() === 1;
  if (candidate) {
    assert(result.uncertainGuard); await page.getByRole('button', { name: '取消', exact: true }).click();
    await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
    result.cancelledRetryKeptDraft = await page.locator('#mail-body').inputValue() === '仅隔离适配器模拟发送，超时必须核对。';
    assert(result.cancelledRetryKeptDraft);
    const actual = await page.evaluate(() => ({ tag: document.activeElement?.tagName, focus: document.activeElement?.textContent?.trim(), lock: document.body.style.overflow }));
    assert.equal(actual.tag, 'BUTTON'); assert.equal(actual.focus, '核对后重新发送'); assert.notEqual(actual.lock, 'hidden'); result.dialogCleanup = actual;
    await page.getByRole('button', { name: '收件箱', exact: true }).click();
    await page.locator('.mailbox-letters[aria-busy="false"]').waitFor();
    await page.locator('.mailbox-letter-list button').nth(1).click(); await page.locator('.mailbox-letter-detail h3').waitFor();
    await page.getByRole('button', { name: '回复', exact: true }).click(); await page.getByRole('alertdialog').waitFor();
    await page.getByRole('button', { name: '取消', exact: true }).click(); await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
    const replyFocus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, focus: document.activeElement?.textContent?.trim(), lock: document.body.style.overflow }));
    assert.equal(replyFocus.tag, 'BUTTON'); assert.equal(replyFocus.focus, '回复'); assert.notEqual(replyFocus.lock, 'hidden'); result.replyDialogCleanup = replyFocus;
    await page.getByRole('button', { name: '写邮件', exact: true }).click();
    assert.equal(await page.locator('#mail-body').inputValue(), '仅隔离适配器模拟发送，超时必须核对。');
    await page.getByRole('button', { name: '查看发送记录', exact: true }).click();
    await page.locator('.mailbox-history[open]').waitFor();
    await page.getByRole('button', { name: '写邮件', exact: true }).click();
    const beforeIme = fixture.writes.length;
    const event = await page.locator('#mail-subject').evaluate(element => {
      element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '待' }));
      const key = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true, bubbles: true, cancelable: true });
      element.dispatchEvent(key);
      element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '待' }));
      return key.defaultPrevented;
    });
    assert(event); assert.equal(fixture.writes.length, beforeIme); result.imeDidNotSend = true;
    // Exercise the real unsaved-route dialog with an isolated draft, then stay.
    await page.locator('.account-brand a').click(); await page.getByRole('alertdialog').waitFor();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(new URL(page.url()).pathname, '/account/mailbox');
    assert.equal(await page.locator('#mail-body').inputValue(), '仅隔离适配器模拟发送，超时必须核对。'); result.unsavedLeavePreservesDraft = true;
  }
  // Same manual resend and ABA edits in both versions; candidate adds the honest uncertainty confirmation.
  fixture.failSend = false;
  const original = '仅隔离适配器模拟发送，超时必须核对。';
  const releaseSend = holdResponse(fixture, 'sendGate');
  try {
    await page.locator('.mailbox-form-footer button').click();
    if (candidate) await page.getByRole('button', { name: '已核对，仍要发送', exact: true }).click();
    await page.locator('#mail-body').fill(original + '重新编辑'); await page.locator('#mail-body').fill(original);
  } finally { releaseSend(); }
  await settledSend(page);
  result.abaDraftRetained = await page.locator('#mail-body').count() ? await page.locator('#mail-body').inputValue() === original : false;
  if (candidate) assert(result.abaDraftRetained);
  result.mockSendAttempts = fixture.writes.length - start;
  return result;
}

(async () => {
  const engine = process.env.ROUND2_ENGINE || 'chrome', suffix = engine === 'webkit' ? '-webkit' : '';
  const report = { started: new Date().toISOString(), engine, cases: [], pageerrors: [], externalAttempts: [], status: 'running' };
  const output = path.resolve(process.env.INTERACTION_EVIDENCE || '.cache/interaction-round2/mail/browser');
  const directory = path.join(output, 'recordings' + suffix); fs.mkdirSync(directory, { recursive: true });
  const browser = await (engine === 'webkit' ? webkit.launch({ headless: true }) : chromium.launch({ channel: 'chrome', headless: true }));
  try {
    const variants = [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }, { name: 'reduce', width: 1440, height: 900, reducedMotion: 'reduce' }];
    for (const variant of variants) for (const candidate of engine === 'webkit' || process.env.ROUND2_CANDIDATE_ONLY === '1' ? [true] : [false, true]) {
      const origin = candidate ? (process.env.INTERACTION_ORIGIN || 'http://127.0.0.1:5235') : (process.env.INTERACTION_BASELINE || 'http://127.0.0.1:5234');
      const name = `${variant.name}-${candidate ? 'after' : 'before'}`;
      const context = await browser.newContext({ viewport: { width: variant.width, height: variant.height }, isMobile: variant.width === 390, hasTouch: variant.width === 390, reducedMotion: variant.reducedMotion || 'no-preference', recordVideo: { dir: directory, size: { width: variant.width, height: variant.height } } });
      await context.route('**/*', route => { if (new URL(route.request().url()).origin !== origin) { report.externalAttempts.push(route.request().url()); return route.abort('blockedbyclient'); } return route.continue(); });
      const fixture = await installFixtures(context, origin), page = await context.newPage();
      page.setDefaultTimeout(12000); page.on('pageerror', error => report.pageerrors.push({ name, text: error.message }));
      const row = { name, origin, candidate, viewport: { width: variant.width, height: variant.height }, httpErrors: [], failedRequests: [] }; report.cases.push(row);
      page.on('response', response => { if (response.status() >= 400) row.httpErrors.push({ url: response.url(), status: response.status() }); });
      page.on('requestfailed', request => row.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
      try {
        row.main = await testFlow(page, { origin, candidate, fixture });
        row.entryAssets = await page.evaluate(() => ({ scripts: [...document.querySelectorAll('script[type="module"][src]')].map(element => element.getAttribute('src')), styles: [...document.querySelectorAll('link[rel="stylesheet"]')].map(element => element.getAttribute('href')) }));
        row.failure = await failureFlow(page, origin, candidate, fixture);
        row.noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth); assert(row.noOverflow);
        row.writeCount = fixture.writes.length; row.writes = fixture.writes.map(item => ({ path: item.path, recipientDomain: item.body.to.split('@').at(-1) }));
        if (candidate) assert(row.writes.every(item => item.recipientDomain === 'example.invalid'));
        row.unexpectedHttpErrors = row.httpErrors.filter(item => item.status !== 502 || !/^\/api\/mailboxes\/(?:send|folders\/inbox(?:\/2)?)$/.test(new URL(item.url).pathname));
        assert.deepEqual(row.unexpectedHttpErrors, []);
        row.completed = true;
      } catch (error) { row.error = error.stack; row.fixtureRequests = fixture.requests; row.fixtureResponses = fixture.responses; row.body = await page.locator('body').innerText().catch(() => 'unavailable'); throw error; }
      finally { const video = page.video(); await context.close(); row.video = path.join('recordings' + suffix, name + '.webm'); await video.saveAs(path.join(output, row.video)); }
    }
    assert.deepEqual(report.pageerrors, []); assert.deepEqual(report.externalAttempts, []); report.status = 'passed';
  } catch (error) { report.error = error.stack; report.status = 'failed'; process.exitCode = 1; console.error(error.stack); }
  finally { await browser.close(); fs.writeFileSync(path.join(output, 'browser-results' + suffix + '.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ status: report.status, cases: report.cases.map(row => ({ name: row.name, completed: row.completed, error: row.error })), pageerrors: report.pageerrors, error: report.error })); }
})();

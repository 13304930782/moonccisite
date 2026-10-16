// Isolated adapters for the real MailboxPage. Never proxies an upstream API.
const assert = require('node:assert/strict');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const makeMessage = uid => ({ uid, from: 'sender@example.invalid', to: 'reader@example.invalid', subject: `离线验收邮件 ${uid}`, date: '2026-10-16T10:00:00Z', unread: true, size: 300,
  replyTo: 'sender@example.invalid', text: `这封邮件由隔离适配器提供，不连接邮局。\n\n邮件编号 ${uid}。\n\n快速切换时应显示最后选择的邮件。` });
function holdResponse(state, key) {
  let resolve; const promise = new Promise(done => { resolve = done; }); state[key] = promise;
  return () => { if (state[key] === promise) state[key] = null; resolve(); };
}
const settledSend = page => page.waitForFunction(() => {
  const form = document.querySelector('.mailbox-form[aria-busy]');
  if (form) return form.getAttribute('aria-busy') === 'false';
  const button = document.querySelector('.mailbox-form-footer button'); return !button || !button.disabled;
});
const settledFolder = page => page.waitForFunction(() => {
  const section = document.querySelector('.mailbox-letters'); if (!section) return false;
  return section.hasAttribute('aria-busy') ? section.getAttribute('aria-busy') === 'false' : !section.querySelector('.mailbox-folder-head button')?.disabled;
});
async function installFixtures(context, origin) {
  assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  const state = { requests: [], responses: [], writes: [], failList: false, failDetail: false, failSend: false, sendDelay: 700 };
  const json = (route, status, body) => { state.responses.push({ path: new URL(route.request().url()).pathname, at: Date.now(), status }); return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'Cache-Control': 'no-store' } }); };
  await context.route('https://status.mooncci.site/badge?*', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>隔离状态fixture</title><body style="margin:0;font:12px system-ui">隔离状态fixture</body></html>' }));
  await context.route(origin + '/api/auth/session', route => json(route, 200, { user: { id: 7001, role: 'owner', username: '隔离交互验收', email: 'reader@example.invalid', status: 'active' } }));
  await context.route(origin + '/api/account/security-config', route => json(route, 200, { enabled: false }));
  await context.route(origin + '/api/engagement/notifications/unread', route => json(route, 200, { unread: 0 }));
  await context.route(origin + '/api/mailboxes/**', async route => {
    const request = route.request(), url = new URL(request.url()), key = url.pathname.slice(4);
    state.requests.push({ path: key + url.search, method: request.method(), at: Date.now() });
    if (request.method() !== 'GET') {
      // A matching intercepted endpoint is the only permitted mail write.
      assert.equal(key, '/mailboxes/send');
      const body = request.postDataJSON(); assert(body.to.endsWith('@example.invalid'));
      state.writes.push({ path: key, body }); if (state.sendGate) await state.sendGate; await pause(state.sendDelay);
      if (state.failSend) return json(route, 502, { message: '离线模拟：邮局发送结果不确定', id: 'mock-uncertain' });
      return json(route, 200, { id: 'mock-accepted-' + state.writes.length, message: '邮件已发送，但未能保存到已发送。', savedToSent: false });
    }
    if (key === '/mailboxes/me') return json(route, 200, { access: { status: 'active', mailbox_address: 'reader@example.invalid', daily_limit: 10, review_note: null, password_change_status: 'idle' } });
    if (key === '/mailboxes/sent') return json(route, 200, { messages: state.writes.map((row, index) => ({ id: 'mock-' + index, recipient_email: row.body.to, subject: row.body.subject, status: state.failSend ? 'uncertain' : 'accepted' })) });
    const match = key.match(/^\/mailboxes\/folders\/(inbox|sent)(?:\/(\d+))?$/); assert(match, 'Unmapped mailbox fixture ' + key);
    if (match[2]) {
      const uid = Number(match[2]); if (uid % 40 === 1 && state.firstReadGate) await state.firstReadGate; await pause(uid % 40 === 1 ? 900 : 250);
      return json(route, state.failDetail ? 502 : 200, state.failDetail ? { message: '离线模拟：暂时无法读取邮件' } : { message: { ...makeMessage(uid), unread: false } });
    }
    await pause(180); if (state.failList) return json(route, 502, { message: '离线模拟：暂时无法读取列表' });
    const page = Number(url.searchParams.get('page') || 1), start = (page - 1) * 40;
    return json(route, 200, { messages: Array.from({ length: 40 }, (_, index) => makeMessage(start + index + 1)), total: 80, page, pageSize: 40, uidValidity: '123', folderAvailable: true });
  });
  return state;
}
async function testFlow(page, { origin = process.env.INTERACTION_ORIGIN || 'http://127.0.0.1:5235', candidate = true, fixture } = {}) {
  const result = { origin, candidate, checks: [], productionWrites: 0 };
  await page.goto(origin + '/account/mailbox', { waitUntil: 'domcontentloaded' });
  const rows = page.locator('.mailbox-letter-list button'); await rows.nth(1).waitFor(); await page.evaluate(() => document.fonts.ready); await rows.nth(1).scrollIntoViewIfNeeded();
  const first = await rows.nth(0).boundingBox(), second = await rows.nth(1).boundingBox();
  // Both pointer commands must happen while the first read is actually pending, even on a cold WebKit driver.
  const releaseRead = holdResponse(fixture, 'firstReadGate'); let firstClickAt, secondClickAt;
  try {
    firstClickAt = Date.now(); await page.mouse.click(first.x + 40, first.y + 20); await page.waitForTimeout(60);
    secondClickAt = Date.now(); await page.mouse.click(second.x + 40, second.y + 20);
  } finally { releaseRead(); }
  await settledFolder(page);
  if (candidate) await page.waitForFunction(() => document.querySelector('.mailbox-letter-detail h3')?.textContent === '离线验收邮件 2');
  const selected = await page.locator('.mailbox-letter-detail h3').innerText();
  result.checks.push({ name: 'rapid-row-selection', firstDelay: 900, secondDelay: 250, actualClickGap: secondClickAt - firstClickAt, selected, expected: '离线验收邮件 2', passed: selected === '离线验收邮件 2' });
  if (candidate) assert.equal(selected, '离线验收邮件 2');
  await page.getByRole('button', { name: '回复', exact: true }).click();
  await page.locator('#mail-body').fill('隔离草稿，发送等待期间继续输入。');
  const releaseSend = holdResponse(fixture, 'sendGate');
  try {
    await page.getByRole('button', { name: '发送邮件', exact: true }).click();
    await page.locator('#mail-body').fill('等待期间补充的新内容必须保留。');
  } finally { releaseSend(); }
  await settledSend(page);
  const draft = await page.locator('#mail-body').count() ? await page.locator('#mail-body').inputValue() : null;
  result.checks.push({ name: 'pending-send-keeps-new-edits', draft, passed: draft === '等待期间补充的新内容必须保留。' });
  if (candidate) assert.equal(draft, '等待期间补充的新内容必须保留。');
  // Existing baseline loses new edits; continue with the same user action sequence.
  await page.getByRole('button', { name: '收件箱', exact: true }).click();
  await rows.first().waitFor(); await page.getByRole('button', { name: '写邮件', exact: true }).click();
  const retained = await page.locator('#mail-body').inputValue();
  result.checks.push({ name: 'folder-roundtrip-retains-draft', passed: retained === '等待期间补充的新内容必须保留。' });
  if (candidate) assert.equal(retained, '等待期间补充的新内容必须保留。');
  if (fixture) result.mockWriteCount = fixture.writes.length;
  result.passed = result.checks.every(check => check.passed);
  return result;
}
module.exports = { installFixtures, testFlow, settledSend, holdResponse };

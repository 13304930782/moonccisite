const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { act, create } = require('react-test-renderer');

const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.children ? text(node.children) : '';
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const message = (uid, subject = `测试邮件 ${uid}`) => ({ uid, subject, from: 'sender@example.invalid', to: 'reader@example.invalid', date: '2026-10-16T10:00:00Z', unread: true, size: 100, text: `离线正文 ${uid}`, replyTo: 'sender@example.invalid' });
const list = (folder = 'inbox', page = 1) => ({ messages: [message(page * 10 + 1), message(page * 10 + 2)], total: folder === 'inbox' ? 80 : 2, page, pageSize: 40, uidValidity: '123', folderAvailable: true });
const source = fs.readFileSync('src/app/pages/MailboxPage.tsx', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;

test('confirmation helper retains an explicit pointer trigger and preserves default or null caller behavior', async () => {
  const helper = ts.transpileModule(fs.readFileSync('src/app/lib/confirmAction.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  class Element {}
  const active = new Element(), pointer = new Element(), document = { activeElement: active }, exports = {};
  new Function('exports', 'document', 'HTMLElement', helper)(exports, document, Element);
  const { confirmAction, confirmationStore, finishConfirmation } = exports;
  const explicit = confirmAction('replace', 'continue', pointer);
  assert.equal(confirmationStore.getSnapshot().trigger, pointer);
  assert.equal(await confirmAction('overlap'), false);
  assert.equal(confirmationStore.getSnapshot().trigger, pointer);
  finishConfirmation(false); assert.equal(await explicit, false);
  const fallback = confirmAction('default'); assert.equal(confirmationStore.getSnapshot().trigger, active);
  finishConfirmation(true); assert.equal(await fallback, true);
  const none = confirmAction('no trigger', 'continue', null); assert.equal(confirmationStore.getSnapshot().trigger, null);
  finishConfirmation(false); await none;
  document.activeElement = {}; const absent = confirmAction('not an HTMLElement');
  assert.equal(confirmationStore.getSnapshot().trigger, null); finishConfirmation(false); await absent;
});

test('mail browser adapter refuses production origins before registering any route', async () => {
  const { installFixtures } = require('../scripts/fixtures/round2-mail.cjs'); let touched = false;
  await assert.rejects(installFixtures({ route() { touched = true; } }, 'https://mooncci.site'));
  assert.equal(touched, false);
});

test('mail test responses remain pending until the native-action scenario explicitly releases them', async () => {
  const { holdResponse } = require('../scripts/fixtures/round2-mail.cjs'), state = {}; let resolved = false;
  const release = holdResponse(state, 'sendGate'), pending = state.sendGate.then(() => { resolved = true; });
  await Promise.resolve(); assert.equal(resolved, false); release(); await pending;
  assert.equal(resolved, true); assert.equal(state.sendGate, null); release();
});

async function fixture(handle) {
  const calls = [], confirmations = [], answers = [], dirty = [], focus = [], scrolls = [], frames = new Map();
  let root, frame = 0, user = { id: 7001, role: 'owner' };
  const browser = { scrollY: 0, addEventListener() {}, removeEventListener() {}, scrollTo(value) { scrolls.push(value); this.scrollY = value.top; }, setInterval, clearInterval };
  const api = async (path, options = {}) => {
    const call = { path, method: options.method || 'GET', body: options.body && JSON.parse(options.body), signal: options.signal };
    calls.push(call);
    const result = handle && await handle(call);
    if (result !== undefined) return result;
    if (path === '/mailboxes/me') return { access: { status: 'active', mailbox_address: `reader-${user.id}@example.invalid`, daily_limit: 10, password_change_status: 'idle' } };
    if (path === '/mailboxes/sent') return { messages: [] };
    const parsed = new URL(path, 'https://fixture.invalid');
    if (/^\/mailboxes\/folders\/(inbox|sent)$/.test(parsed.pathname)) return list(parsed.pathname.split('/').at(-1), Number(parsed.searchParams.get('page') || 1));
    if (/^\/mailboxes\/folders\/(inbox|sent)\/\d+$/.test(parsed.pathname)) return { message: { ...message(Number(parsed.pathname.split('/').at(-1))), unread: false } };
    if (path === '/mailboxes/send') return { id: 'fixture-accepted', message: '邮件已发送，但未能保存到已发送。', savedToSent: false };
    throw Error('Unmapped fixture request ' + path);
  };
  const mocks = {
    '../lib/api': { api },
    '../lib/browserDiagnostics': { visibleDiagnostic() {} },
    '../lib/confirmAction': { confirmAction: async (...args) => { confirmations.push(args); assert(answers.length, 'Every confirmation requires an explicit test answer'); return answers.shift(); } },
    '../lib/useUnsavedLeave': { useUnsavedLeave: value => dirty.push(value) },
    '../context/AuthContext': { useAuth: () => ({ user }) },
    'react-router-dom': { Link: ({ to, children, ...props }) => React.createElement('a', { ...props, href: to }, children) },
    'lucide-react': Object.fromEntries(['ArrowLeft', 'ArrowUpRight', 'Check', 'Copy', 'Eye', 'EyeOff', 'Inbox', 'KeyRound', 'Mail', 'RefreshCw', 'Send'].map(key => [key, 'svg'])),
  };
  const module = { exports: {} };
  new Function('exports', 'require', 'window', 'location', 'requestAnimationFrame', 'cancelAnimationFrame', code)(module.exports,
    name => name.endsWith('.css') ? {} : mocks[name] || require(name), browser, { pathname: '/account/mailbox' },
    fn => { frames.set(++frame, fn); return frame; }, key => frames.delete(key));
  const Page = module.exports.default;
  await act(async () => { root = create(React.createElement(Page), { createNodeMock: element => ({
    focus: () => focus.push(element.props['data-mail-uid'] || element.type),
    querySelector: selector => ({ focus: () => focus.push(selector) }),
  }) }); });
  const button = label => { const found = root.root.findAllByType('button').find(node => text(node) === label); assert(found, 'Missing button ' + label); return found; };
  const click = async (label, trigger = { tagName: 'BUTTON', textContent: label }) => act(async () => button(label).props.onClick({ currentTarget: trigger }));
  const edit = async (id, value) => act(async () => root.root.findByProps({ id }).props.onChange({ target: { value } }));
  const open = async uid => act(async () => root.root.findByProps({ 'data-mail-uid': uid }).props.onClick());
  const send = async submitter => act(async () => { void root.root.findAllByType('form').find(node => node.props['aria-busy'] !== undefined).props.onSubmit({ preventDefault() {}, nativeEvent: { submitter } }); });
  const draft = async () => { await click('写邮件'); await edit('mail-to', 'target@example.invalid'); await edit('mail-subject', '离线测试标题'); await edit('mail-body', '离线测试正文'); };
  const flushFrames = async () => act(async () => { for (const [id, fn] of [...frames]) { frames.delete(id); fn(); } });
  return { root, calls, confirmations, answers, dirty, focus, scrolls, browser, button, click, edit, open, send, draft, flushFrames,
    json: () => text(root.toJSON()), writes: () => calls.filter(call => call.method !== 'GET'),
    switchAccount: async id => { user = { ...user, id }; await act(async () => root.update(React.createElement(Page))); },
    close: async () => act(async () => root.unmount()),
  };
}

test('mail reads follow the newest row, folder or cancellation even if an aborted adapter resolves late', async () => {
  const pending = [];
  const f = await fixture(call => /\/folders\/inbox\/\d+/.test(call.path) ? new Promise((resolve, reject) => pending.push({ ...call, resolve, reject })) : undefined);
  try {
    await f.open(11);
    assert.equal(f.root.root.findByProps({ 'data-mail-uid': 12 }).props.disabled, undefined);
    assert.match(f.json(), /正在打开邮件…/);
    await f.open(12); assert(pending[0].signal.aborted);
    await act(async () => pending[1].resolve({ message: message(12) }));
    await act(async () => pending[0].resolve({ message: message(11) }));
    assert.match(f.json(), /离线正文 12/); assert.doesNotMatch(f.json(), /离线正文 11/);
    await f.click('返回列表'); await f.open(11); await f.click('已发送');
    await act(async () => pending[2].reject(Error('旧详情不应显示')));
    assert.doesNotMatch(f.json(), /旧详情不应显示|离线正文 11/);
    await f.click('收件箱'); await f.open(11); await f.click('取消读取');
    await act(async () => pending[3].resolve({ message: message(11) }));
    assert.equal(f.root.root.findAllByProps({ className: 'mailbox-letter-detail' }).length, 0);
  } finally { await f.close(); }
});

test('failed initial folder has an honest error and explicit retry, not an unavailable-folder empty state', async () => {
  let fail = true;
  const f = await fixture(call => call.path.includes('/folders/inbox?') && fail ? Promise.reject(Error('离线列表故障')) : undefined);
  try {
    assert.match(f.json(), /离线列表故障/); assert.doesNotMatch(f.json(), /邮局尚未提供|收件箱里还没有/);
    fail = false; await f.click('重试读取列表');
    assert(f.root.root.findByProps({ 'data-mail-uid': 11 })); assert.doesNotMatch(f.json(), /离线列表故障/);
  } finally { await f.close(); }
});

test('cancelling the initial read retains an explicit restart instead of showing a false empty folder', async () => {
  const pending = deferred(); let first = true;
  const f = await fixture(call => { if (call.path.includes('/folders/inbox?') && first) { first = false; return pending.promise; } });
  try {
    await f.click('取消读取'); assert.match(f.json(), /读取已取消，可以重新加载/);
    assert.doesNotMatch(f.json(), /邮局尚未提供|收件箱里还没有/);
    await act(async () => pending.resolve(list()));
    assert.equal(f.root.root.findAllByProps({ 'data-mail-uid': 11 }).length, 0);
    await f.click('重试读取列表'); assert(f.root.root.findByProps({ 'data-mail-uid': 11 }));
  } finally { await f.close(); }
});

test('expired folder permission clears cached headers and refuses to offer retry for a stale message UID', async () => {
  let denied = true;
  const f = await fixture(call => call.path.includes('/inbox/11?') && denied ? Promise.reject(Object.assign(Error('邮箱权限已改变'), { status: 403 })) : undefined);
  try {
    await f.open(11); assert.match(f.json(), /邮箱权限已改变/);
    assert.equal(f.root.root.findAllByProps({ 'data-mail-uid': 11 }).length, 0);
    assert.equal(f.root.root.findAllByType('button').some(button => text(button) === '重试读取邮件'), false);
    denied = false; await f.click('重试读取列表'); assert(f.root.root.findByProps({ 'data-mail-uid': 11 }));
  } finally { await f.close(); }
});

test('failed detail retries the same UID with the original UIDVALIDITY while keeping the list usable', async () => {
  let fail = true;
  const f = await fixture(call => call.path.includes('/inbox/11?') && fail ? Promise.reject(Error('离线详情故障')) : undefined);
  try {
    await f.open(11); assert.match(f.json(), /离线详情故障/); assert(f.root.root.findByProps({ 'data-mail-uid': 12 }));
    fail = false; await f.click('重试读取邮件');
    assert.match(f.json(), /离线正文 11/);
    assert.equal(f.calls.filter(call => /\/inbox\/11\?uidValidity=123$/.test(call.path)).length, 2);
  } finally { await f.close(); }
});

test('paging, folder switches, reply return and detail return preserve list page, scroll and keyboard focus', async () => {
  const f = await fixture();
  try {
    await f.click('下一页'); assert(f.root.root.findByProps({ 'data-mail-uid': 21 }));
    f.browser.scrollY = 630; await f.open(21); assert(f.focus.includes('h3'));
    await f.click('回复'); await f.edit('mail-body', '回复保留内容');
    const before = f.calls.length; await f.click('返回邮件');
    assert.equal(f.calls.length, before, 'Reply return restores the read message without refetching');
    assert.match(f.json(), /离线正文 21/);
    await f.click('返回列表'); await f.flushFrames();
    assert.equal(f.scrolls.at(-1).top, 630); assert(f.focus.includes('[data-mail-uid="21"]'));
    assert.match(f.json(), /第 2 页/);
    f.browser.scrollY = 700; await f.click('已发送'); await f.click('收件箱'); await f.flushFrames();
    assert.match(f.json(), /第 2 页/); assert.equal(f.scrolls.at(-1).top, 700);
    await f.click('写邮件'); assert.equal(f.root.root.findByProps({ id: 'mail-body' }).props.value, '回复保留内容');
  } finally { await f.close(); }
});

test('reply never silently overwrites another draft and existing unsaved-leave protection observes it', async () => {
  const f = await fixture();
  try {
    await f.draft(); assert.equal(f.dirty.at(-1), true);
    const trigger = { tagName: 'BUTTON', textContent: '回复' };
    await f.click('收件箱'); await f.open(11); f.answers.push(false); await f.click('回复', trigger);
    assert.equal(f.confirmations.at(-1)[2], trigger);
    assert.match(f.json(), /离线正文 11/); await f.click('写邮件');
    assert.equal(f.root.root.findByProps({ id: 'mail-subject' }).props.value, '离线测试标题');
    await f.click('收件箱'); await f.open(11); f.answers.push(true); await f.click('回复');
    assert.equal(f.root.root.findByProps({ id: 'mail-subject' }).props.value, 'Re: 测试邮件 11');
    assert.equal(f.root.root.findByProps({ id: 'mail-body' }).props.value, '');
    assert.equal(f.confirmations.length, 2); assert.equal(f.writes().length, 0);
  } finally { await f.close(); }
});

test('send waits for the actual result, blocks duplicate submits and preserves edits made during the request', async () => {
  const pending = deferred();
  const f = await fixture(call => call.path === '/mailboxes/send' ? pending.promise : undefined);
  try {
    await f.draft(); await f.send(); await f.send(); assert.equal(f.writes().length, 1);
    assert.equal(f.button('发送中…').props.disabled, true);
    await f.edit('mail-body', '等待期间输入的新正文');
    await act(async () => pending.resolve({ id: 'accepted-1', message: '邮件已发送，但未能保存到已发送。', savedToSent: false }));
    assert.equal(f.root.root.findByProps({ id: 'mail-body' }).props.value, '等待期间输入的新正文');
    assert.equal(f.root.root.findByProps({ id: 'mail-subject' }).props.value, '离线测试标题');
    assert.match(f.json(), /未能保存到已发送。 等待期间的新编辑已保留/);
    assert.deepEqual(f.writes()[0].body, { to: 'target@example.invalid', subject: '离线测试标题', content: '离线测试正文' });
  } finally { await f.close(); }
});

test('an accepted send clears only the sent draft and never steals a later folder navigation', async () => {
  const pending = deferred();
  const f = await fixture(call => call.path === '/mailboxes/send' ? pending.promise : undefined);
  try {
    await f.draft(); await f.send(); await f.click('收件箱');
    await act(async () => pending.resolve({ id: 'accepted-2', message: '邮件已发送并保存到已发送。' }));
    assert.equal(f.button('收件箱').props['aria-current'], 'page');
    await f.click('写邮件'); assert.equal(f.root.root.findByProps({ id: 'mail-body' }).props.value, '');
    assert.equal(f.dirty.at(-1), false);
  } finally { await f.close(); }
});

test('ABA edits of any compose field remain a new draft even when values return to the submitted snapshot', async () => {
  for (const [id, original, changed] of [['mail-to', 'target@example.invalid', 'different@example.invalid'], ['mail-subject', '离线测试标题', '新的标题'], ['mail-body', '离线测试正文', '新的正文']]) {
    const pending = deferred();
    const f = await fixture(call => call.path === '/mailboxes/send' ? pending.promise : undefined);
    try {
      await f.draft(); await f.send(); await f.edit(id, changed); await f.edit(id, original);
      await act(async () => pending.resolve({ id: 'accepted-aba', message: '邮件已发送。' }));
      assert.equal(f.root.root.findByProps({ id }).props.value, original, id + ' ABA content retained');
      assert.equal(f.button('写邮件').props['aria-current'], 'page'); assert.match(f.json(), /等待期间的新编辑已保留/);
      assert.equal(f.writes().length, 1);
    } finally { await f.close(); }
  }
});

test('uncertain sends preserve the draft, expose records and require explicit checked confirmation before a retry', async () => {
  let attempts = 0;
  const f = await fixture(call => {
    if (call.path === '/mailboxes/send' && ++attempts === 1) throw Object.assign(Error('timeout'), { uncertain: true, kind: 'timeout' });
  });
  try {
    await f.draft(); await f.send(); assert.match(f.json(), /发送结果尚未确认，草稿已保留/);
    assert.equal(f.root.root.findByProps({ id: 'mail-body' }).props.value, '离线测试正文');
    const submitter = { tagName: 'BUTTON', textContent: '核对后重新发送' };
    assert.equal(f.writes().length, 1); f.answers.push(false); await f.send(submitter); assert.equal(f.writes().length, 1);
    assert.equal(f.confirmations.at(-1)[2], submitter);
    await f.click('查看发送记录'); assert.equal(f.root.root.findByType('details').props.open, true);
    await act(async () => f.root.root.findByType('details').props.onToggle({ currentTarget: { open: true } }));
    assert(f.calls.some(call => call.path === '/mailboxes/sent'));
    await f.click('写邮件'); f.answers.push(true); await f.send();
    assert.equal(f.writes().length, 2); assert.equal(f.confirmations.at(-1)[1], '已核对，仍要发送');
  } finally { await f.close(); }
});

test('definitive send rejection keeps every field and allows a deliberate normal retry', async () => {
  let fail = true;
  const f = await fixture(call => call.path === '/mailboxes/send' && fail ? Promise.reject(Object.assign(Error('收件地址无效'), { status: 400, uncertain: false })) : undefined);
  try {
    await f.draft(); await f.send(); assert.match(f.json(), /收件地址无效/);
    assert.equal(f.root.root.findByProps({ id: 'mail-body' }).props.value, '离线测试正文');
    fail = false; await f.send(); assert.equal(f.writes().length, 2); assert.equal(f.confirmations.length, 0);
  } finally { await f.close(); }
});

test('uncertain send invalidates a pre-send history read so checking records gets a fresh result', async () => {
  const oldHistory = deferred(); let historyCalls = 0;
  const f = await fixture(call => {
    if (call.path === '/mailboxes/sent' && ++historyCalls === 1) return oldHistory.promise;
    if (call.path === '/mailboxes/sent') return { messages: [{ id: 'uncertain-new', recipient_email: 'target@example.invalid', subject: '离线测试标题', status: 'uncertain' }] };
    if (call.path === '/mailboxes/send') throw Object.assign(Error('timeout'), { uncertain: true });
  });
  try {
    await f.click('已发送'); await act(async () => { void f.root.root.findByType('details').props.onToggle({ currentTarget: { open: true } }); });
    await f.draft(); await f.send();
    await act(async () => oldHistory.resolve({ messages: [] }));
    await f.click('查看发送记录'); await act(async () => f.root.root.findByType('details').props.onToggle({ currentTarget: { open: true } }));
    assert.equal(historyCalls, 2, 'An old successful history read cannot suppress checking the newer send');
    assert.match(f.json(), /结果待核对/);
  } finally { await f.close(); }
});

test('an obsolete history finally cannot clear the pending state or trigger duplicate reads of the current check', async () => {
  const oldHistory = deferred(), currentHistory = deferred(); let historyCalls = 0;
  const f = await fixture(call => {
    if (call.path === '/mailboxes/sent') return ++historyCalls === 1 ? oldHistory.promise : currentHistory.promise;
    if (call.path === '/mailboxes/send') throw Object.assign(Error('timeout'), { uncertain: true });
  });
  try {
    await f.click('已发送'); await act(async () => { void f.root.root.findByType('details').props.onToggle({ currentTarget: { open: true } }); });
    await f.draft(); await f.send(); await f.click('查看发送记录');
    await act(async () => { void f.root.root.findByType('details').props.onToggle({ currentTarget: { open: true } }); });
    assert.equal(historyCalls, 2);
    await act(async () => oldHistory.resolve({ messages: [] })); assert.match(f.json(), /正在加载记录/);
    await act(async () => { void f.root.root.findByType('details').props.onToggle({ currentTarget: { open: true } }); });
    assert.equal(historyCalls, 2, 'The current check remains pending after obsolete completion');
    await act(async () => currentHistory.resolve({ messages: [{ id: 'new-check', recipient_email: 'target@example.invalid', subject: '离线测试标题', status: 'uncertain' }] }));
    assert.match(f.json(), /结果待核对/); assert.doesNotMatch(f.json(), /正在加载记录/);
  } finally { await f.close(); }
});

test('IME composition confirmation is suppressed without changing normal form submission semantics', async () => {
  const f = await fixture();
  try {
    await f.draft(); const main = f.root.root.findByType('main'); let prevented = 0, stopped = 0;
    await act(async () => main.props.onCompositionStart());
    main.props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: true }, preventDefault: () => prevented++ });
    main.props.onSubmitCapture({ preventDefault: () => prevented++, stopPropagation: () => stopped++ });
    await f.send(); assert.equal(f.writes().length, 0); assert.equal(prevented, 2); assert.equal(stopped, 1);
    await act(async () => main.props.onCompositionEnd()); await f.send(); assert.equal(f.writes().length, 1);
  } finally { await f.close(); }
});

test('account changes cannot inherit previous account draft, late mail or sending state', async () => {
  const pending = deferred();
  const f = await fixture(call => call.path === '/mailboxes/send' ? pending.promise : undefined);
  try {
    await f.draft(); await f.send(); await f.switchAccount(7002);
    await act(async () => pending.resolve({ id: 'old-account', message: '旧账户确认' }));
    assert.doesNotMatch(f.json(), /旧账户确认/); await f.click('写邮件');
    assert.equal(f.root.root.findByProps({ id: 'mail-body' }).props.value, '');
    assert.equal(f.button('发送邮件').props.disabled, false);
  } finally { await f.close(); }
});

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const {act, create} = require('react-test-renderer');
const {fixture: i18nFixture} = require('./helpers/i18n.cjs');

const code = ts.transpileModule(fs.readFileSync('src/app/pages/MailboxPage.tsx', 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX},
}).outputText;
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.children ? text(node.children) : '';

async function fixture(confirm = async () => true, messageSubject = 'Received subject', passwordChangeStatus = 'idle') {
  const confirmations = [], sends = [];
  const message = {uid: 1, from: 'Sender', to: 'reader@mooncci.site', replyTo: 'sender@example.invalid', subject: messageSubject, text: 'Received body', unread: false};
  const api = async (url, options = {}) => {
    if (url === '/mailboxes/me') return {access: {status: 'active', mailbox_address: 'reader@mooncci.site', daily_limit: 10, password_change_status: passwordChangeStatus}};
    if (url === '/mailboxes/send') { sends.push(JSON.parse(options.body)); return {id: 'sent', message: 'accepted'}; }
    if (url.startsWith('/mailboxes/folders/inbox/')) return {message};
    if (url.startsWith('/mailboxes/folders/')) return {messages: [message], total: 1, page: 1, pageSize: 25, uidValidity: '1', folderAvailable: true};
    throw Error(`Unexpected request: ${url}`);
  };
  const mocks = {
    '../lib/api': {api},
    '../lib/confirmAction': {confirmAction: async (...args) => { confirmations.push(args); return confirm(...args); }},
    '../lib/browserDiagnostics': {visibleDiagnostic() {}},
    '../lib/useUnsavedLeave': {useUnsavedLeave() {}},
    '../context/AuthContext': {useAuth: () => ({user: {id: 2, role: 'user'}})},
  };
  const mod = {exports: {}};
  new Function('exports', 'require', 'window', 'requestAnimationFrame', 'cancelAnimationFrame', code)(mod.exports,
    name => i18nFixture(name) || (name.endsWith('.css') ? {} : mocks[name] || require(name)),
    {scrollY: 0, scrollTo() {}, setInterval: () => 1, clearInterval() {}}, () => 1, () => {});
  let root;
  await act(async () => { root = create(React.createElement(mod.exports.default)); });
  const button = name => {
    const node = root.root.findAllByType('button').find(node => text(node) === name);
    assert(node, `Expected button: ${name}`);
    return node;
  };
  const click = name => act(async () => { button(name).props.onClick(); });
  const values = () => Object.fromEntries(['mail-to', 'mail-subject', 'mail-body'].map(id => [id, root.root.findByProps({id}).props.value]));
  const fill = values => act(async () => { for (const [id, value] of Object.entries(values)) root.root.findByProps({id}).props.onChange({target: {value}}); });
  const openMessage = async () => { await click('收件箱'); await click(`Sender${messageSubject}`); };
  return {root, confirmations, sends, button, click, values, fill, openMessage, close: () => act(async () => root.unmount())};
}

const unsent = {'mail-to': 'previous@example.invalid', 'mail-subject': 'Private draft', 'mail-body': 'Unrelated private body'};

test('password-change blocking reasons stay outside the collapsed client settings', async () => {
  for (const status of ['pending', 'claimed', 'review']) {
    const f = await fixture(async () => true, 'Received subject', status);
    try {
      const notices = f.root.root.findAll(node => node.props.className?.includes('mailbox-blocking-status'));
      assert.equal(notices.length, 1);
      assert.equal(notices[0].props.role, status === 'review' ? 'alert' : 'status');
      assert.ok(text(notices[0]).length > 0);
      for (let node = notices[0].parent; node; node = node.parent) assert.notEqual(node.type, 'details');
      assert.equal(f.root.root.findAll(node => node.props.className === 'mailbox-view-tabs').length, 0);
    } finally { await f.close(); }
  }
});

test('cancelled reply preserves all unsent fields, confirmed reply starts empty and sends only new writing', async () => {
  let accepted = false;
  const f = await fixture(async () => accepted);
  try {
    await f.click('写邮件'); await f.fill(unsent); await f.openMessage();
    await f.click('回复');
    assert.equal(f.root.root.findAllByProps({id: 'mail-body'}).length, 0, 'Cancel stays on the received message');
    assert.match(f.confirmations[0][0], /未发送.*回复正文将为空/);
    await f.click('写邮件'); assert.deepEqual(f.values(), unsent);
    await f.openMessage(); accepted = true; await f.click('回复');
    assert.deepEqual(f.values(), {'mail-to': 'sender@example.invalid', 'mail-subject': 'Re: Received subject', 'mail-body': ''});
    assert.equal(f.root.root.findByProps({id: 'mail-body'}).props.required, true, 'Blank reply cannot pass native form validation');
    assert.equal(f.sends.length, 0);
    await f.fill({'mail-body': 'Only the new reply'});
    await act(async () => { await f.root.root.findByType('form').props.onSubmit({preventDefault() {}}); });
    assert.deepEqual(f.sends, [{to: 'sender@example.invalid', subject: 'Re: Received subject', content: 'Only the new reply'}]);
  } finally { await f.close(); }
});

test('blank compose replies without confirmation and existing Re prefix is retained', async () => {
  const f = await fixture(async () => { throw Error('A blank compose needs no discard confirmation'); }, 'Re: Existing reply');
  try {
    await f.click('SenderRe: Existing reply'); await f.click('回复');
    assert.equal(f.confirmations.length, 0);
    assert.deepEqual(f.values(), {'mail-to': 'sender@example.invalid', 'mail-subject': 'Re: Existing reply', 'mail-body': ''});
  } finally { await f.close(); }
});

test('recipient-only, subject-only and body-only drafts each require confirmation and survive cancellation', async () => {
  for (const [id, value] of Object.entries(unsent)) {
    const f = await fixture(async () => false);
    try {
      await f.click('写邮件'); await f.fill({[id]: value}); await f.openMessage(); await f.click('回复');
      assert.equal(f.confirmations.length, 1);
      await f.click('写邮件'); assert.equal(f.values()[id], value);
    } finally { await f.close(); }
  }
});

test('late reply confirmation cannot replace draft after navigation', async () => {
  let resolve;
  const answer = new Promise(done => { resolve = done; });
  const f = await fixture(() => answer);
  try {
    await f.click('写邮件'); await f.fill(unsent); await f.openMessage(); await f.click('回复');
    await f.click('写邮件');
    await act(async () => { resolve(true); await answer; });
    assert.deepEqual(f.values(), unsent);
  } finally { await f.close(); }
});

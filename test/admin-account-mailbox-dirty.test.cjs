const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const React = require('react');
const {act, create} = require('react-test-renderer');
const {fixture: i18nFixture} = require('./helpers/i18n.cjs');

async function fixture(entry, api, props) {
  const listeners = new Set();
  const mocks = {
    i18n: i18nFixture('../i18n'), LocaleLink: i18nFixture('../LocaleLink'), api: {api},
    AuthContext: {useAuth: () => ({user: {id: 2, role: 'user'}})},
    FormInput: {FormInput: props => React.createElement('input', props)},
    SiteBack: {SiteBack: () => null}, ContentUI: {PageHeading: () => null}, NodeMonitorPermission: {NodeMonitorPermission: () => null},
    feedback: {notify: {success() {}}}, browserDiagnostics: {visibleDiagnostic() {}}, confirmAction: {confirmAction: async () => true},
    ThemeSelect: {ThemeSelect: ({children, onValueChange, ...props}) => React.createElement('select', {...props, onChange: e => onValueChange(e.target.value)}, children)},
  };
  const result = await require('esbuild').build({
    entryPoints: [`src/app/${entry}.tsx`], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', loader: {'.css': 'empty'},
    plugins: [{name: 'dirty-test-services', setup(build) {
      build.onResolve({filter: /\/(i18n|LocaleLink|api|AuthContext|FormInput|SiteBack|ContentUI|NodeMonitorPermission|feedback|browserDiagnostics|confirmAction|ThemeSelect)$/}, args => ({path: `mock:${args.path.split('/').at(-1)}`, external: true}));
    }}],
  });
  const context = {module: {exports: {}}, console, AbortController, URLSearchParams, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, window: {
    scrollY: 0, scrollTo() {}, addEventListener: (type, fn) => { if (type === 'beforeunload') listeners.add(fn); }, removeEventListener: (_, fn) => listeners.delete(fn),
  }, require: name => name.startsWith('mock:') ? mocks[name.slice(5)] : name === 'react-router-dom' ? {useParams: () => ({id: '2'}), useNavigate: () => () => {}} : require(name)};
  vm.runInNewContext(result.outputFiles[0].text, context);
  const Component = context.module.exports.default || context.module.exports.AccountProfileForm;
  function Profile() {
    const [user, setUser] = React.useState(props.user);
    return React.createElement(Component, {...props, user, onSaved: setUser});
  }
  let root;
  await act(async () => { root = create(React.createElement(props ? Profile : Component)); });
  return {root, listeners, close: () => act(async () => root.unmount())};
}
const initial = {id: 2, username: 'Reader', email: 'reader@example.test', role: 'user', status: 'active', can_comment: 1, version: 1};
const change = (node, value) => act(async () => node.props.onChange({target: {value}}));
const submit = (root, index = 0) => act(async () => root.root.findAllByType('form')[index].props.onSubmit({preventDefault() {}}));
const nameInput = root => root.root.findByProps({autoComplete: 'username'});
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.children ? text(node.children) : '';

test('shared profile guards real edits for personal and admin callers, retains failed saves and accepts canonical saved name', async () => {
  for (const base of ['/account', '/admin/users/2']) {
    let fail = true;
    const f = await fixture('components/AccountProfileForm', async (path, options) => {
      assert.equal(path, base === '/account' ? base : `${base}/settings`);
      if (fail) throw Error('profile failed');
      return {user: {...initial, username: JSON.parse(options.body).username.trim(), version: 2}, message: 'saved'};
    }, {user: initial, base, inlineFeedback: true});
    try {
      assert.equal(f.listeners.size, 0);
      await change(nameInput(f.root), 'Edited'); assert.equal(f.listeners.size, 1);
      await change(nameInput(f.root), initial.username); assert.equal(f.listeners.size, 0);
      await change(nameInput(f.root), ' Edited '); await submit(f.root);
      assert.equal(nameInput(f.root).props.value, ' Edited '); assert.equal(f.listeners.size, 1);
      fail = false; await submit(f.root);
      assert.equal(nameInput(f.root).props.value, 'Edited'); assert.equal(f.listeners.size, 0);
    } finally { await f.close(); }
  }
});

test('admin name, email and permission drafts clear only after their own successful save', async () => {
  let saved = {...initial}, fail = '', readFail = false;
  const f = await fixture('pages/AdminUserSettingsPage', async (path, options) => {
    if (!options) { if (readFail) throw Error('refresh failed'); return {user: {...saved}}; }
    if (fail === path) throw Error('save failed');
    const fields = JSON.parse(options.body);
    if (path === '/admin/users/2') { saved = {...saved, ...fields}; return {message: 'saved'}; }
    saved = {...saved, ...fields, ...(fields.email ? {email: fields.email.trim().toLowerCase()} : {}), version: saved.version + 1};
    return {user: {...saved}, message: 'saved'};
  });
  const email = () => f.root.root.findByProps({type: 'email'});
  const permission = index => f.root.root.findAllByType('select')[index];
  try {
    assert.equal(f.listeners.size, 0);
    for (const [index, value, original] of [[0, 'editor', 'user'], [1, 'disabled', 'active'], [2, '0', '1']]) {
      await change(permission(index), value); assert.equal(f.listeners.size, 1);
      await change(permission(index), original); assert.equal(f.listeners.size, 0);
    }
    await change(nameInput(f.root), 'New reader'); await change(email(), ' NEW@example.test '); await change(permission(0), 'editor');
    assert.equal(f.listeners.size, 2);
    fail = '/admin/users/2/settings'; await submit(f.root, 0);
    assert.equal(nameInput(f.root).props.value, 'New reader'); assert.equal(f.listeners.size, 2);
    fail = ''; await submit(f.root, 0);
    assert.equal(permission(0).props.value, 'editor'); assert.equal(email().props.value, ' NEW@example.test '); assert.equal(f.listeners.size, 1);
    fail = '/admin/users/2/email'; await submit(f.root, 1);
    assert.equal(email().props.value, ' NEW@example.test '); assert.equal(f.listeners.size, 1);
    fail = ''; await submit(f.root, 1);
    assert.equal(email().props.value, 'new@example.test'); assert.equal(permission(0).props.value, 'editor'); assert.equal(f.listeners.size, 1);
    fail = '/admin/users/2'; await submit(f.root, 2);
    assert.equal(permission(0).props.value, 'editor'); assert.equal(f.listeners.size, 1);
    fail = ''; await submit(f.root, 2); assert.equal(f.listeners.size, 0);
    await change(email(), 'pending@example.test'); await change(permission(2), '0'); await submit(f.root, 2);
    assert.equal(email().props.value, 'pending@example.test'); assert.equal(f.listeners.size, 1);
    await change(email(), saved.email); assert.equal(f.listeners.size, 0);
    await change(permission(1), 'disabled'); readFail = true; await submit(f.root, 2);
    assert.equal(nameInput(f.root).props.value, 'New reader'); assert.equal(permission(1).props.value, 'disabled'); assert.equal(f.listeners.size, 1);
    assert.match(JSON.stringify(f.root.toJSON()), /refresh failed/);
  } finally { await f.close(); }
});

test('mailbox registers each draft field, locks all editing during send and preserves failed sends', async () => {
  let release, reject;
  const sends = [];
  const f = await fixture('pages/MailboxPage', async (path, options) => {
    if (path === '/mailboxes/me') return {access: {status: 'active', mailbox_address: 'reader@mooncci.site', daily_limit: 10}};
    if (path.startsWith('/mailboxes/folders/')) return {messages: [], total: 0, page: 1, pageSize: 25, uidValidity: '1', folderAvailable: true};
    if (path === '/mailboxes/send') { sends.push(JSON.parse(options.body)); return new Promise((resolve, fail) => { release = resolve; reject = fail; }); }
    throw Error(`Unexpected request ${path}`);
  });
  const fields = ['mail-to', 'mail-subject', 'mail-body'];
  const input = id => f.root.root.findByProps({id});
  const compose = () => act(async () => f.root.root.findAllByType('button').find(node => text(node) === '写邮件').props.onClick());
  try {
    await compose(); assert.equal(f.listeners.size, 0);
    for (const id of fields) { await change(input(id), 'draft'); assert.equal(f.listeners.size, 1); await change(input(id), ''); assert.equal(f.listeners.size, 0); }
    await change(input('mail-to'), 'to@example.test'); await change(input('mail-subject'), 'Subject'); await change(input('mail-body'), 'Private body');
    let prevented = false; const event = {preventDefault() { prevented = true; }};
    for (const listener of f.listeners) listener(event);
    assert.equal(prevented, true); assert.equal(event.returnValue, '');
    let sending;
    await act(async () => { sending = f.root.root.findByType('form').props.onSubmit({preventDefault() {}}); });
    for (const id of fields) assert.equal(input(id).props.disabled, true);
    await act(async () => { reject(Error('send failed')); await sending; });
    assert.equal(input('mail-body').props.value, 'Private body'); assert.equal(f.listeners.size, 1);
    for (const id of fields) assert.equal(input(id).props.disabled, false);
    await act(async () => { sending = f.root.root.findByType('form').props.onSubmit({preventDefault() {}}); });
    await act(async () => { release({id: 'sent', message: 'accepted'}); await sending; });
    assert.equal(f.listeners.size, 0); await compose();
    for (const id of fields) assert.equal(input(id).props.value, '');
    assert.deepEqual(sends, [{to: 'to@example.test', subject: 'Subject', content: 'Private body'}, {to: 'to@example.test', subject: 'Subject', content: 'Private body'}]);
  } finally { await f.close(); }
});

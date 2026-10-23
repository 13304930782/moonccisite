const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const React = require('react');
const Renderer = require('react-test-renderer');

async function loadPage(name, request, options = {}) {
  const listeners = new Set();
  const mocks = {
    ...options.mocks,
    api: {api: request},
    AuthContext: {useAuth: () => ({user: {role: 'owner'}})},
    MarkdownContent: {MarkdownContent: () => null},
    ArticleMediaPicker: {ArticleMediaPicker: () => null},
    AdminWeatherCompanionSettings: {AdminWeatherCompanionSettings: () => null},
    feedback: {notify: {success() {}, error() {}}},
    ThemeSelect: {ThemeSelect: ({children, onValueChange, ...props}) => React.createElement('select', {...props, onChange: e => onValueChange(e.target.value)}, children)},
  };
  const result = await require('esbuild').build({
    entryPoints: [`src/app/pages/${name}.tsx`], bundle: true, write: false,
    platform: 'node', format: 'cjs', packages: 'external', loader: {'.css': 'empty'},
    plugins: [{name: 'settings-test-services', setup(build) {
      if (options.mocks) build.onResolve({filter: /\/(confirmAction|useUnsavedLeave)$/}, args => ({path: `mock:${args.path.split('/').at(-1)}`, external: true}));
      build.onResolve({filter: /\/(api|feedback|ThemeSelect|AuthContext|MarkdownContent|ArticleMediaPicker|AdminWeatherCompanionSettings)$/}, args => ({path: `mock:${args.path.split('/').at(-1)}`, external: true}));
    }}],
  });
  const context = {module: {exports: {}}, console, URLSearchParams, window: {
    addEventListener: (type, callback) => { if (type === 'beforeunload') listeners.add(callback); },
    removeEventListener: (type, callback) => listeners.delete(callback),
  }, require: name => name.startsWith('mock:') ? mocks[name.slice(5)] : name === 'react-router-dom' ? {Link: ({children, to, ...props}) => React.createElement('a', {...props, href: to}, children)} : require(name)};
  vm.runInNewContext(result.outputFiles[0].text, context);
  let tree;
  await Renderer.act(async () => { tree = Renderer.create(React.createElement(context.module.exports.default || context.module.exports.AdminElectricityRooms, options.props)); });
  return {tree, listeners};
}
const button = (tree, text) => tree.root.findAllByType('button').find(node => node.children.filter(child => typeof child === 'string').join('').trim() === text);
const submit = async tree => Renderer.act(async () => tree.root.findByType('form').props.onSubmit({preventDefault() {}}));

test('AI settings discard restores snapshot; failed save preserves inputs and successful save clears dirty state', async () => {
  let fail = true;
  const initial = {enabled: false, model: 'deepseek-flash', has_key: true};
  const {tree, listeners} = await loadPage('AdminAiSettingsPage', async (_, options) => {
    if (!options) return initial;
    if (fail) throw Error('test save failed');
    const value = JSON.parse(options.body);
    return {enabled: value.enabled, model: value.model, has_key: true};
  });
  const key = () => tree.root.findByProps({'aria-label': 'DeepSeek API Key'});
  assert.equal(button(tree, '放弃更改').props.disabled, true);
  Renderer.act(() => key().props.onChange({target: {value: 'test-key'}}));
  assert.equal(listeners.size, 1);
  await submit(tree);
  assert.equal(key().props.value, 'test-key');
  assert.equal(tree.root.findByProps({role: 'alert'}).children.join(''), 'test save failed');
  Renderer.act(() => button(tree, '放弃更改').props.onClick());
  assert.equal(key().props.value, '');
  assert.equal(listeners.size, 0);
  Renderer.act(() => key().props.onChange({target: {value: 'test-key'}}));
  fail = false;
  await submit(tree);
  assert.equal(key().props.value, '');
  assert.equal(listeners.size, 0);
  assert.equal(button(tree, '放弃更改').props.disabled, true);
  Renderer.act(() => tree.unmount());
});

test('provider settings discard restores saved credentials; failed save retains secret; success updates snapshot', async () => {
  let fail = true;
  const initial = {provider: 'github', name: 'GitHub', enabled: false, ready: false, client_id: 'saved-id', has_secret: true, version: 1, source: 'database', callback_url: '/callback', origin: 'https://example.test'};
  const {tree, listeners} = await loadPage('AdminLoginSettingsPage', async (_, options) => {
    if (!options) return {providers: [initial]};
    if (fail) throw Error('test save failed');
    const fields = JSON.parse(options.body);
    return {provider: {...initial, client_id: fields.client_id, enabled: fields.enabled, version: 2}, message: 'saved'};
  });
  const secret = () => tree.root.findByProps({type: 'password'});
  Renderer.act(() => secret().props.onChange({target: {value: 'test-secret'}}));
  assert.equal(listeners.size, 1);
  await submit(tree);
  assert.equal(secret().props.value, 'test-secret');
  assert.equal(tree.root.findByProps({role: 'alert'}).children.join(''), 'test save failed');
  Renderer.act(() => button(tree, '放弃更改').props.onClick());
  assert.equal(secret().props.value, '');
  assert.equal(listeners.size, 0);
  Renderer.act(() => secret().props.onChange({target: {value: 'test-secret'}}));
  fail = false;
  await submit(tree);
  assert.equal(secret().props.value, '');
  assert.equal(listeners.size, 0);
  assert.equal(button(tree, '放弃更改').props.disabled, true);
  Renderer.act(() => tree.unmount());
});

test('provider settings treats loaded empty list as empty, not endless loading', async () => {
  const {tree} = await loadPage('AdminLoginSettingsPage', async () => ({providers: []}));
  assert.match(JSON.stringify(tree.toJSON()), /暂无可配置的登录方式/);
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /正在加载登录设置/);
  Renderer.act(() => tree.unmount());
});


test('mail discard clears edited secret and restores loaded settings without a send request', async () => {
  const requests = [];
  const {tree, listeners} = await loadPage('AdminMailSettingsPage', async (path, options) => {
    requests.push([path, options]);
    if (options) throw Error('No write expected');
    return {smtp_host: 'smtp.example.test', has_smtp_pass: true};
  });
  const secret = () => tree.root.findAllByType('input').find(node => node.props.placeholder === '已保存密码；不修改可留空');
  Renderer.act(() => secret().props.onChange({target: {value: 'temporary-secret'}}));
  assert.equal(listeners.size, 1);
  Renderer.act(() => button(tree, '放弃更改').props.onClick());
  assert.equal(secret().props.value, '');
  assert.equal(listeners.size, 0);
  assert.equal(button(tree, '保存邮件设置').props.disabled, true);
  assert.equal(requests.length, 1);
  Renderer.act(() => tree.unmount());
});

test('site settings discard resets only its section and keeps other edits dirty', async () => {
  const {tree, listeners} = await loadPage('AdminSiteSettingsPage', async path => path === '/now' ? {content: 'saved-now', updated_at: null} : {brand: {site_title: 'saved-name'}, hero: {title: 'saved-title'}, footer: {copyright: 'saved-copyright'}});
  const form = id => tree.root.findAllByType('form').find(node => node.props.id === id);
  const input = (id, value) => form(id).findAllByType('input').find(node => node.props.value === value);
  Renderer.act(() => input('brand', 'saved-name').props.onChange({target: {value: 'edited-name'}}));
  Renderer.act(() => input('hero', 'saved-title').props.onChange({target: {value: 'edited-title'}}));
  Renderer.act(() => button({root: form('brand')}, '放弃更改').props.onClick());
  assert.ok(input('brand', 'saved-name'));
  assert.ok(input('hero', 'edited-title'));
  assert.equal(listeners.size, 1);
  Renderer.act(() => button({root: form('hero')}, '放弃更改').props.onClick());
  assert.equal(listeners.size, 0);
  Renderer.act(() => tree.unmount());
});

test('node connection discard removes pending secret and leaves saved connection intact', async () => {
  const {tree, listeners} = await loadPage('AdminNodeMonitorPage', async () => ({configured: true}));
  const key = () => tree.root.findByProps({id: 'monitor-key'});
  Renderer.act(() => key().props.onChange({target: {value: 'temporary-key'}}));
  assert.equal(listeners.size, 1);
  Renderer.act(() => button(tree, '放弃更改').props.onClick());
  assert.equal(key().props.value, '');
  assert.equal(listeners.size, 0);
  assert.match(JSON.stringify(tree.toJSON()), /已配置/);
  Renderer.act(() => tree.unmount());
});



test('mailbox load failure shows retry rather than a false empty list', async () => {
  let failed = true;
  const {tree} = await loadPage('AdminMailboxRequestsPage', async () => {
    if (failed) throw Error('test fetch failed');
    return {requests: [], counts: {}, total: 0, page: 1, limit: 20};
  });
  assert.match(JSON.stringify(tree.toJSON()), /test fetch failed/);
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /暂无邮箱申请/);
  failed = false;
  await Renderer.act(async () => button(tree, '重试').props.onClick());
  assert.match(JSON.stringify(tree.toJSON()), /暂无邮箱申请/);
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /test fetch failed/);
  Renderer.act(() => tree.unmount());
});

test('room switching and room editing confirm pending settings; active settings save disables switching', async () => {
  let accepted = false, confirmations = 0;
  const rooms = [{id: 'one', name: 'One', active: true}, {id: 'two', name: 'Two', active: true}];
  const {tree} = await loadPage('../components/AdminElectricityRooms', async () => ({data: rooms}), {
    mocks: {useUnsavedLeave: {hasUnsavedChanges: () => true}, confirmAction: {confirmAction: async () => { confirmations++; return accepted; }}},
    props: {children: (room, setBusy) => React.createElement('button', {onClick: () => setBusy(true)}, `busy-${room.id}`)},
  });
  const select = () => tree.root.findByType('select');
  await Renderer.act(async () => select().props.onChange({target: {value: 'two'}}));
  assert.equal(select().props.value, 'one');
  await Renderer.act(async () => button(tree, '添加宿舍').props.onClick());
  assert.equal(tree.root.findAllByProps({id: 'room-editor-title'}).length, 0);
  accepted = true;
  await Renderer.act(async () => select().props.onChange({target: {value: 'two'}}));
  assert.equal(select().props.value, 'two');
  assert.equal(confirmations, 3);
  Renderer.act(() => button(tree, 'busy-two').props.onClick());
  assert.equal(select().props.disabled, true);
  assert.equal(button(tree, '添加宿舍').props.disabled, true);
  Renderer.act(() => tree.unmount());
});

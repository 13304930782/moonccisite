const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const React = require('react');
const { act, create } = require('react-test-renderer');
const { buildSync } = require('esbuild');
const code = buildSync({ entryPoints: ['src/app/components/SocialLoginButtons.tsx'], bundle: true, write: false,
  platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime'] }).outputFiles[0].text;
test('login and signup show only enabled providers, preserve Google row and request redirect through API', async () => {
  for (const context of ['signin', 'signup']) {
    let root, destination, sent;
    const module = { exports: {} };
    const window = { google: { accounts: { id: {} } }, location: { assign: value => { destination = value; } } };
    const fetch = async (url, options) => {
      if (url.endsWith('/providers')) return Response.json({ providers: [{ provider: 'google', name: 'Google', client_id: 'retained-client' }, { provider: 'qq', name: 'QQ' }] });
      sent = [url, JSON.parse(options.body)]; return Response.json({ url: 'https://graph.qq.com/oauth2.0/authorize?state=fixture' });
    };
    vm.runInNewContext(code, { module, exports: module.exports, require, window, fetch, FormData, Headers, console });
    await act(async () => { root = create(React.createElement(module.exports.SocialLoginButtons, { context, onCredential: () => {}, onError: assert.fail, returnTo: '/electricity' })); });
    const buttons = root.root.findAllByType('button').filter(x => x.props['aria-label']);
    assert.equal(buttons.length, 2); assert.match(buttons[1].props['aria-label'], context === 'signup' ? /注册/ : /登录/);
    assert.equal(root.root.findAllByType('img')[0].props.src, '/login-icons/qq.svg');
    assert.equal(root.root.findAll(x => x.props.className === 'auth-google-local').length, 1);
    assert.ok(!JSON.stringify(root.toJSON()).includes('GitHub'));
    await act(async () => { await buttons[1].props.onClick(); });
    assert.equal(sent[0], '/api/auth/qq/start'); assert.equal(sent[1].return_to, '/electricity');
    assert.equal(new URL(destination).hostname, 'graph.qq.com');
    await act(async () => root.unmount());
  }
});

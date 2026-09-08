const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const React = require('react');
const { act, create } = require('react-test-renderer');
const { buildSync } = require('esbuild');
const code = buildSync({ entryPoints: ['src/app/context/AuthContext.tsx'], bundle: true, write: false,
  platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime'] }).outputFiles[0].text;

test('auth UI preserves failed logout, rejects HTML success, ignores stale me and synchronizes tabs', async t => {
  const user = { id: 1, username: 'fixture', role: 'owner' };
  let mode = 'normal', meRelease, loginRelease, logoutCalls = 0;
  const storage = new Map();
  const localStorage = { removeItem: key => storage.delete(key), setItem: (key, value) => storage.set(key, value) };
  const window = new EventTarget();
  window.setTimeout = setTimeout; window.clearTimeout = clearTimeout;
  const fetch = async (url) => {
    if (url.endsWith('/auth/me')) {
      if (mode === 'delayed') return new Promise(resolve => { meRelease = () => resolve(Response.json({ user })); });
      if (mode === 'unavailable') return Response.json({ message: 'offline' }, { status: 503 });
      return Response.json({ user });
    }
    if (url.endsWith('/auth/logout')) {
      logoutCalls++;
      if (mode === 'failure') throw Error('offline');
      if (mode === 'html') return new Response('<!DOCTYPE html><html>proxy fallback</html>', { headers: { 'Content-Type': 'text/html' } });
      return Response.json({ message: 'logged out' });
    }
    if (mode === 'login-delayed') return new Promise(resolve => { loginRelease = () => resolve(Response.json({ user })); });
    return Response.json({ user });
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require, window, localStorage,
    sessionStorage: localStorage, fetch, FormData, Headers, AbortController, AbortSignal, console });
  const { AuthProvider, useAuth } = module.exports;
  let auth, root;
  function Probe() { auth = useAuth(); return null; }
  await act(async () => { root = create(React.createElement(AuthProvider, null, React.createElement(Probe))); });
  t.after(() => root.unmount());
  assert.equal(auth.user.id, 1);
  mode = 'unavailable';
  await act(async () => { await auth.refreshUser(); });
  assert.equal(auth.user.id, 1, '503 must not impersonate logout');
  for (mode of ['failure', 'html']) {
    await act(async () => { assert.equal(await auth.logout(), false); });
    assert.equal(auth.user.id, 1);
    assert.ok(auth.logoutError);
  }
  mode = 'delayed';
  let refresh;
  await act(async () => { refresh = auth.refreshUser(); });
  mode = 'normal';
  const before = logoutCalls;
  await act(async () => {
    const first = auth.logout(), second = auth.logout();
    assert.equal(first, second);
    assert.equal(await first, true);
  });
  assert.equal(logoutCalls, before + 1);
  assert.equal(auth.user, null);
  await act(async () => { meRelease(); await refresh; });
  assert.equal(auth.user, null, 'late me response cannot resurrect the old login');
  assert.ok(storage.get('mooncci:logout'));
  await act(async () => { await auth.login('fixture@example.test', 'password'); });
  const event = new Event('storage'); event.key = 'mooncci:logout'; event.newValue = 'other-tab';
  await act(async () => { window.dispatchEvent(event); });
  assert.equal(auth.user, null);
  mode = 'login-delayed';
  let signingIn, signingOut;
  const previousCalls = logoutCalls;
  await act(async () => { signingIn = auth.login('fixture@example.test', 'password'); signingOut = auth.logout(); });
  assert.equal(logoutCalls, previousCalls, 'logout waits for pending login cookie');
  mode = 'normal';
  await act(async () => { loginRelease(); await signingIn; assert.equal(await signingOut, true); });
  assert.equal(auth.user, null);
  assert.equal(logoutCalls, previousCalls + 1);
});

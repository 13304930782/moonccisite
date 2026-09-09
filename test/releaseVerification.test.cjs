const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { mkdtemp, mkdir, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

test('live verification detects HTML API fallback, stale cache, broken assets and missing cache protection using GET only', async t => {
  const { verifyLive } = await import('../scripts/verify-live.mjs');
  const root = await mkdtemp(join(tmpdir(), 'mooncci-live-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'dist/assets'), { recursive: true });
  await writeFile(join(root, 'dist/index.html'), '<html>release</html>');
  await writeFile(join(root, 'dist/assets/app.js'), 'export default 1;');
  await writeFile(join(root, 'dist/assets/shared.js'), 'export default 2;');
  await writeFile(join(root, 'dist/assets/app.css'), 'body{}');
  await writeFile(join(root, 'dist/asset-manifest.json'), JSON.stringify({
    'index.html': { isEntry: true, file: 'assets/app.js', css: ['assets/app.css'], imports: ['shared'] },
    shared: { file: 'assets/shared.js' },
  }));
  let mode = 'ok';
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push({ method: req.method, cookie: req.headers.cookie, auth: req.headers.authorization });
    const path = new URL(req.url, 'http://localhost').pathname;
    res.setHeader('Cache-Control', mode === 'cache' ? 'public, max-age=600' : 'private, no-store');
    if (mode === 'timeout' && path === '/') return;
    if (path.startsWith('/api') && mode !== 'html') {
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = path === '/api/health' ? 200 : 401;
      res.end(path === '/api/health' ? '{"ok":true}' : '{"message":"Unauthorized"}');
    } else if (path.endsWith('.js') && mode !== 'asset') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(path.includes('shared') ? 'export default 2;' : 'export default 1;');
    } else if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css'); res.end('body{}');
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.end(mode === 'stale' ? '<html>old release</html>' : '<html>release</html>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const valid = await verifyLive(origin, root);
  assert.equal(valid.length, 7);
  assert.ok(valid.every(check => check.ok));
  for (mode of ['html', 'stale', 'asset', 'cache', 'timeout']) {
    const result = await verifyLive(origin, root, { timeout: mode === 'timeout' ? 100 : 5000 });
    assert.ok(result.some(check => !check.ok), mode);
    assert.equal(result.length, 7, 'one failure must not suppress remaining diagnostics');
  }
  assert.ok(requests.every(req => req.method === 'GET' && !req.cookie && !req.auth));
  await assert.rejects(verifyLive(`${origin}/subpath`, root));
});

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { buildSync } = require('esbuild');
const compiled = buildSync({ entryPoints: ['src/app/lib/safeUrl.ts'], bundle: true,
  write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
const sandbox = { module: { exports: {} }, URL };
vm.runInNewContext(compiled, sandbox);
const { safeHref, safeImageSrc } = sandbox.module.exports;

test('image preview rejects executable schemes and URL-encodes attribute-breaking text', () => {
  for (const input of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:image/svg+xml,<svg onload=alert(1)>',
    'vbscript:msgbox(1)', 'java\nscript:alert(1)', '//evil.test/a', '\\evil.test/a']) {
    assert.equal(safeImageSrc(input), '');
  }
  for (const prefix of ['/api/uploads/', './', '../', '#', 'https://example.test/']) {
    const input = prefix + 'x" onerror="alert(1)';
    const html = renderToStaticMarkup(React.createElement('img', { src: safeImageSrc(input), alt: '' }));
    assert.ok(html.includes('%22'));
    assert.equal(safeImageSrc(input), prefix + 'x%22 onerror=%22alert(1)');
    assert.ok(!html.includes(' onerror="'));
    assert.ok(!html.includes('<script'));
  }
  assert.equal(safeImageSrc('/api/uploads/photo.png'), '/api/uploads/photo.png');
});


test('URL escaping preserves existing percent escapes, query delimiters, Unicode and allowed schemes', () => {
  for (const input of ['/api/uploads/a%20b.png?width=300&height=200', './封面.png', '../image.webp', '#section',
    'https://example.test/a%2Fb?q=x%26y&next=%3Ctag%3E', 'mailto:reader@example.test?subject=Hello&body=World']) {
    assert.equal(safeHref(input), input);
  }
  assert.equal(safeHref(`/article/<tag>"'x`), '/article/%3ctag%3e%22%27x');
  assert.equal(safeImageSrc('mailto:reader@example.test'), '');
  for (const input of ['javascript:alert(1)', 'java\nscript:alert(1)', 'data:text/html,<svg onload=alert(1)>',
    '//evil.test', '/\\evil.test', 'javascript&#58;alert(1)']) assert.equal(safeHref(input), '');
});

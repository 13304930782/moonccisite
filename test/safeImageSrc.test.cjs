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
const { safeImageSrc } = sandbox.module.exports;

test('image preview rejects executable schemes and React escapes attribute-breaking text', () => {
  for (const input of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:image/svg+xml,<svg onload=alert(1)>',
    'vbscript:msgbox(1)', 'java\nscript:alert(1)', '//evil.test/a', '\\evil.test/a']) {
    assert.equal(safeImageSrc(input), '');
  }
  for (const prefix of ['/api/uploads/', './', '../', '#', 'https://example.test/']) {
    const input = prefix + 'x" onerror="alert(1)';
    const html = renderToStaticMarkup(React.createElement('img', { src: safeImageSrc(input), alt: '' }));
    assert.ok(html.includes('&quot;'));
    assert.ok(!html.includes(' onerror="'));
    assert.ok(!html.includes('<script'));
  }
  assert.equal(safeImageSrc('/api/uploads/photo.png'), '/api/uploads/photo.png');
});

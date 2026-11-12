const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('Grok geometry retains every original coordinate', async () => {
  const { compactGrokGeometry } = await import('../scripts/compact-grok-geometry.mjs');
  const source = fs.readFileSync('src/vendor/grok-ball/grok-ball.js', 'utf8');
  const original = JSON.parse(source.match(/^\s*EXPRESSIONS:\s*(\[.*\]),\s*$/m)[1]);
  const packed = compactGrokGeometry(source).match(/^\s*EXPRESSIONS:\s*(.*),\s*$/m)[1];
  assert.equal(JSON.stringify(vm.runInNewContext(packed, { atob })), JSON.stringify(original));
});

test('RE2 Unicode compression reconstructs all tables exactly', async () => {
  const { compactRe2Unicode } = await import('../scripts/compact-re2-unicode.mjs');
  const source = fs.readFileSync('node_modules/re2js/build/index.js', 'utf8');
  const original = [...source.matchAll(/decode(?:Ranges|Orbit)\("([^"\\]+)"/g)].map(match => match[1]);
  const packed = compactRe2Unicode(source).split('\n', 1)[0];
  const decoded = vm.runInNewContext(`${packed};__mooncciUnicodeTables`);
  assert.equal(JSON.stringify(decoded), JSON.stringify(original));
});

test('RE2 table data cannot escape generated JavaScript string literals', async () => {
  const { compactRe2Unicode } = await import('../scripts/compact-re2-unicode.mjs');
  const payload = '</script><script>globalThis.injected=1</script>\n';
  const source = Array.from({ length: 201 }, () => `decodeRanges("${payload}")`).join('\n');
  const packed = compactRe2Unicode(source).split('\n', 1)[0];
  const context = vm.createContext({});
  const decoded = vm.runInContext(`${packed};__mooncciUnicodeTables`, context);
  assert.equal(decoded.length, 201);
  assert.equal(decoded[0], payload);
  assert.equal(context.injected, undefined);
  assert.doesNotMatch(packed, /<\/script>/i);
});

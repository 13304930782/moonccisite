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

test('RE2 compression preserves overlapping and long-distance matches', async () => {
  const { compactRe2Unicode } = await import('../scripts/compact-re2-unicode.mjs');
  let seed = 123456;
  const noise = Array.from({ length: 40000 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[seed % 62];
  }).join('');
  const words = ['a'.repeat(300), 'ABCDE'.repeat(60), 'SENTINELshort', noise, 'SENTINELshort', ...Array(200).fill('tail')];
  const source = words.map(word => `decodeRanges("${word}")`).join('\n');
  const packed = compactRe2Unicode(source).split('\n', 1)[0];
  assert.equal(JSON.stringify(vm.runInNewContext(`${packed};__mooncciUnicodeTables`)), JSON.stringify(words));
});

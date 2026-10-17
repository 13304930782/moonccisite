const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('syntax compaction keeps the configured browser target and observable behavior', async () => {
  const { compactSyntax } = await import('../scripts/compact-syntax.mjs');
  const source = `let reads = 0; const object = { get value() { reads++; return 0; } };
    globalThis.result = [object?.value ?? 9, null?.value ?? 9, reads];`;
  for (const target of ['es2015', ['es2020', 'safari14']]) {
    const plugin = compactSyntax();
    plugin.configResolved({ build: { target } });
    const output = await plugin.renderChunk(source, { fileName: 'entry.js' });
    const context = {}; vm.runInNewContext(output.code, context);
    assert.equal(JSON.stringify(context.result), '[0,9,1]');
    if (target === 'es2015') assert.ok(!output.code.includes('?.'));
  }
});

test('extension adapter covers actual editor and StarterKit imports with official implementations', async () => {
  const adapter = fs.readFileSync('src/app/lib/tiptapExtensions.ts', 'utf8');
  const exports = new Set();
  for (const match of adapter.matchAll(/export \{ (\w+) \} from '(@tiptap\/extensions\/[^']+)'/g)) {
    const implementation = await import(match[2]);
    assert.ok(implementation[match[1]]?.name);
    exports.add(match[1]);
  }
  for (const file of ['src/components/tiptap-templates/simple/simple-editor.tsx', 'node_modules/@tiptap/starter-kit/dist/index.js']) {
    const source = fs.readFileSync(file, 'utf8');
    const imports = [...source.matchAll(/import \{([^}]+)\} from ["']@tiptap\/extensions["']/g)];
    assert.ok(imports.length, `Expected extension imports in ${file}`);
    for (const match of imports) for (const name of match[1].split(',').map(value => value.trim())) {
      assert.ok(exports.has(name), `Missing official extension: ${name}`);
    }
  }
});

test('license collection keeps complete notices while indexing them only in entry chunks', async () => {
  const { licenseNotices } = await import('../scripts/license-notices.mjs');
  const { minify } = await import('terser');
  const plugin = licenseNotices(); plugin.buildStart();
  const entry = plugin.renderChunk('/*! @license Entry copyright */\nconsole.log(1)', { isEntry: true });
  assert.equal(plugin.renderChunk('/* Copyright lazy dependency */\nconsole.log(2)', { isEntry: false }), null);
  let asset; plugin.generateBundle.call({ emitFile(value) { asset = value; } });
  assert.equal(asset.fileName, 'THIRD_PARTY_LICENSES.txt');
  assert.ok(asset.source.includes('Entry copyright'));
  assert.ok(asset.source.includes('Copyright lazy dependency'));
  const output = await minify(entry.code, { format: { comments: /^! Third-party notices: \/THIRD_PARTY_LICENSES\.txt $/ } });
  assert.ok(output.code.includes('Third-party notices: /THIRD_PARTY_LICENSES.txt'));
  assert.ok(!output.code.includes('Entry copyright'));
});

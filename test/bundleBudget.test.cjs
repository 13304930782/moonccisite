const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
test('bundle budget counts static dependencies once and catches hidden growth behind chunk splitting', async t => {
  const { measureBundle, checkBudget } = await import('../scripts/check-bundle-budget.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-budget-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [name, size] of [['entry.js', 10], ['shared.js', 20], ['lazy.js', 40], ['style.css', 5]]) fs.writeFileSync(path.join(dir, name), 'x'.repeat(size));
  fs.writeFileSync(path.join(dir, 'asset-manifest.json'), JSON.stringify({
    main: { file: 'entry.js', isEntry: true, imports: ['shared'], dynamicImports: ['lazy'], css: ['style.css'] },
    shared: { file: 'shared.js', imports: ['main'] }, lazy: { file: 'lazy.js', imports: ['shared'] },
  }));
  const size = measureBundle(dir);
  assert.equal(size.entryJsBytes, 30);
  assert.equal(size.totalJsBytes, 70);
  assert.equal(size.entryCssBytes, 5);
  assert.throws(() => checkBudget(size, { totalJsBytes: 60 }), /exceeds/);
  fs.unlinkSync(path.join(dir, 'shared.js'));
  assert.throws(() => measureBundle(dir));
});

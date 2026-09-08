const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
test('editor build replaces its embedded vulnerable purifier and rejects unknown upstream layouts', async () => {
  const { replaceEditorSanitizer } = await import('../scripts/editor-sanitizer.mjs');
  for (const name of ['index.js', 'indexViewer.js']) {
    const input = fs.readFileSync(`node_modules/@toast-ui/editor/dist/esm/${name}`, 'utf8');
    const output = replaceEditorSanitizer(input);
    assert.match(output, /import purify from 'dompurify'/);
    assert.doesNotMatch(output, /DOMPurify 2\.3\.3|function createDOMPurify\(/);
    assert.match(output, /purify\.sanitize\(/);
  }
  assert.throws(() => replaceEditorSanitizer('unknown upstream layout'), /review the security adapter/);
});

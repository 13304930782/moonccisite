const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const moduleObject = { exports: {} };
new Function('exports', 'module', ts.transpileModule(
  fs.readFileSync('src/app/lib/commentTime.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } },
).outputText)(moduleObject.exports, moduleObject);
const { formatCommentTime } = moduleObject.exports;

test('new comments use Beijing date across UTC midnight and explicit offsets', () => {
  assert.equal(formatCommentTime('2026-10-14T22:32:00.000Z'), '2026-10-15');
  assert.equal(formatCommentTime('2026-10-14T22:32:00.000Z', true), '2026-10-15 06:32:00');
  assert.equal(formatCommentTime('2026-10-14T15:59:59Z'), '2026-10-14');
  assert.equal(formatCommentTime('2026-10-14T16:00:00Z', true), '2026-10-15 00:00:00');
  assert.equal(formatCommentTime('2026-10-15T06:32:00+08:00', true), '2026-10-15 06:32:00');
  assert.equal(formatCommentTime('2026-10-14T15:32:00-07:00', true), '2026-10-15 06:32:00');
});

test('legacy unzoned comment dates keep their Beijing wall time; missing dates stay neutral', () => {
  assert.equal(formatCommentTime('2026-10-15 06:32:00', true), '2026-10-15 06:32:00');
  assert.equal(formatCommentTime('2026-10-15T06:32:00', true), '2026-10-15 06:32:00');
  assert.equal(formatCommentTime('2026-10-15'), '2026-10-15');
  for (const value of [undefined, null, '', 'bad date']) assert.equal(formatCommentTime(value), '-');
});

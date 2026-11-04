const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/app/pages/festivals-v2/timelineLayout.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exportsObject = {};
new Function('exports', compiled)(exportsObject);
const { layoutTimelineLabels } = exportsObject;

test('crowded translated labels stay inside the canvas and never overlap within a lane', () => {
  for (const width of [808, 1024, 1440]) {
    const labels = [0, 3, 4, 8, 13, 26, 48, 70, 72, 73, 82, 92, 100].map((percent, index) => ({
      anchor: percent * width / 100,
      width: [90, 132, 118, 164][index % 4],
    }));
    const positions = layoutTimelineLabels(labels, width);
    positions.forEach(position => {
      assert.ok(position.left >= 0);
      assert.ok(position.left + position.width <= width);
      positions.filter(other => other.lane === position.lane && other.index !== position.index).forEach(other => {
        assert.ok(position.left + position.width + 16 <= other.left || other.left + other.width + 16 <= position.left);
      });
    });
    assert.ok(new Set(positions.map(position => position.lane)).size > 1);
  }
});

test('empty timelines are valid and long labels clamp to the canvas', () => {
  assert.deepEqual(layoutTimelineLabels([], 808), []);
  assert.deepEqual(layoutTimelineLabels([{ anchor: 400, width: 1000 }], 808), [{ index: 0, width: 808, left: 0, lane: 0 }]);
});

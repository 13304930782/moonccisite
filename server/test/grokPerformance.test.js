const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { render } = require('./helpers/grokRender.cjs');

// Golden hashes generated from the unmodified pinned upstream runtime before
// the SVG write-cache patch, using this deterministic timeline/seed. These
// cover every frame of all 32 exposed emotions, gaze, transitions and effects.
const baselines = [
  {
    interval: 5,
    hash: 'fa95e13c10d0c48468e8efe5e8f1ffb1114da6e1bdec0f73b89c5688fc095237',
    writes: 635539,
    frames: 41600,
  },
  {
    interval: 1000 / 60,
    hash: '1126fc16089bb6abc1d6e90939b0d7850d00700b6c21f93ea189d53d19a24604',
    writes: 193029,
    frames: 12480,
  },
];
for (const baseline of baselines) {
  test(`SVG output matches upstream at ${baseline.interval}ms cadence with fewer writes`, () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../src/vendor/grok-ball/grok-ball.js'),
      'utf8',
    );
    const result = render(source, baseline.interval);
    assert.equal(result.hash, baseline.hash);
    assert.equal(result.emotions, 32);
    assert.equal(result.frames, baseline.frames);
    assert.ok(result.writes < baseline.writes);
  });
}

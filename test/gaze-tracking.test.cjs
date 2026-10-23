const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(pointerTracking = true) {
  let now = 1000;
  class Element {
    constructor() { this.attrs = {}; this.style = {}; this.children = []; }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    getAttribute(name) { return this.attrs[name] ?? null; }
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); child.parentNode = null; }
    remove() { this.parentNode?.removeChild(this); }
  }
  const math = Object.create(Math);
  math.random = () => 0.42;
  const context = vm.createContext({ window: {}, document: { createElementNS: () => new Element() },
    Math: math, performance: { now: () => now }, requestAnimationFrame: () => 1,
    cancelAnimationFrame() {}, clearInterval() {}, console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/vendor/grok-ball/grok-ball.js'), 'utf8'), context);
  const ball = context.window.GrokBall.create(new Element(), { autostart: false, lite: false, pointerTracking });
  // Isolate pointer attention from random emotion scheduling, preserving real pose composition.
  ball._seq = null;
  ball._transDur = 0;
  ball._def.anims = [];
  ball._def.base.left.lookX = ball._def.base.right.lookX = -12;
  ball._def.base.body.rotate = 0.8;
  ball._lastTick = now;
  return { ball, advance(milliseconds, hz = 60, pointer) {
    const frames = Math.round(milliseconds / 1000 * hz);
    for (let i = 0; i < frames; i++) {
      now += 1000 / hz;
      if (pointer) ball.setGaze(...pointer);
      ball._tick(now);
    }
    return ball._lastPose;
  } };
}

test('pointer gaze expands bounds, eases without jumping, and reverses smoothly', () => {
  const { ball, advance } = fixture();
  ball.setGaze(9, -9);
  assert.equal(ball._gaze.tx, 40);
  assert.equal(ball._gaze.ty, -26);
  advance(1000 / 60);
  assert.ok(ball._gaze.x > 0 && ball._gaze.x < 2);
  advance(3000, 60, [1, -1]);
  assert.ok(ball._gaze.x > 39.9 && ball._gaze.x <= 40);
  assert.ok(ball._gaze.y < -25.9 && ball._gaze.y >= -26);
  advance(1000 / 60, 60, [-1, 1]);
  assert.ok(ball._gaze.x > 25, 'one reversed pointer frame must not flip the eyes');
  ball.destroy();
});

test('pointer easing is consistent at 60 and 120 Hz', () => {
  const slow = fixture();
  const fast = fixture();
  slow.advance(1000, 60, [1, 1]);
  fast.advance(1000, 120, [1, 1]);
  assert.ok(Math.abs(slow.ball._gaze.x - fast.ball._gaze.x) < 0.15);
  assert.ok(Math.abs(slow.ball._pointerWeight - fast.ball._pointerWeight) < 1e-10);
  slow.ball.destroy(); fast.ball.destroy();
});

test('active pointer suppresses opposite autonomous look/yaw and idle restores them', () => {
  const { ball, advance } = fixture();
  const following = advance(3000, 60, [1, 0]);
  assert.ok(following.left.lookX > 31);
  ball.spin(1, 1);
  const turning = advance(200, 60, [1, 0]);
  assert.ok(ball._spin && Math.abs(ball._spin.x) > 0.1);
  assert.ok(Math.abs(turning.body.yaw - ball._gaze.x * .0075) < 0.001);
  assert.ok(Math.abs(turning.body.rotate - ball._gaze.x * .075) < 0.001);
  const resting = advance(6000);
  assert.ok(resting.body.yaw < -.08, 'autonomous gaze must turn the head after pointer inactivity');
  assert.ok(Math.abs(resting.left.lookX) < 2, 'shared idle glance must not slide the face inside the hat');
  assert.ok(Math.abs(resting.body.rotate - 0.8) < 0.001);
  assert.ok(Math.abs(ball._gaze.x) < 0.001);
  ball.spin(1, 1);
  assert.ok(Math.abs(advance(200).body.yaw) > 0.1, 'autonomous turning must resume');
  ball.destroy();
});

test('clearGaze fades to neutral and the default runtime remains opt-out', () => {
  const { ball, advance } = fixture();
  advance(3000, 60, [1, 1]);
  ball.clearGaze();
  assert.equal(ball._gaze.tx, 0); assert.equal(ball._gaze.ty, 0);
  advance(3000);
  assert.ok(Math.abs(ball._gaze.x) < 0.01);
  assert.ok(ball._pointerWeight < 0.001);
  ball.destroy();
  const original = fixture(false);
  original.ball.setGaze(1, -1);
  assert.equal(original.ball._gaze.tx, 24);
  assert.equal(original.ball._gaze.ty, -15);
  original.advance(2000);
  assert.equal(original.ball._pointerWeight, 0);
  assert.equal(original.ball._lastPose.body.rotate, 0.8);
  original.ball.destroy();
});

test('head pitch follows the eased vertical gaze and resets with attention', () => {
  const { ball, advance } = fixture();
  const up = advance(3000, 60, [0, -1]);
  assert.ok(up.body.pitch < -.44);
  const down = advance(3000, 60, [0, 1]);
  assert.ok(down.body.pitch > .44);
  ball.clearGaze();
  assert.ok(Math.abs(advance(3000).body.pitch) < .03);
  ball.destroy();
  const original = fixture(false);
  assert.equal(original.advance(2000).body.pitch, undefined);
  original.ball.destroy();
});

 test('autonomous shared glances drive hat angles while preserving eye expression differences', () => {
  const { ball, advance } = fixture();
  ball._def.antics = false;
  ball._def.base.left.lookX = -28;
  ball._def.base.right.lookX = -32;
  ball._def.base.left.lookY = ball._def.base.right.lookY = -20;
  const pose = advance(100);
  assert.ok(Math.abs(pose.body.yaw + .225) < .001);
  assert.ok(Math.abs(pose.body.pitch + 20 / 26 * .45) < .001);
  assert.ok(Math.abs(pose.left.lookX) < 4 && Math.abs(pose.right.lookX) < 4);
  assert.ok(pose.left.lookX > pose.right.lookX);
  ball.destroy();
});


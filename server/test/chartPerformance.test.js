const test = require('node:test');
const assert = require('node:assert/strict');

test('chart sizes use delivered layout, coalesce resizes and clean up pending work', async (t) => {
  const { observeChartSize } = await import(
    '../../src/app/lib/observeChartSize.ts'
  );
  let callback;
  let observed;
  let disconnected = false;
  let id = 0;
  const frames = new Map();
  const originals = [
    'ResizeObserver',
    'requestAnimationFrame',
    'cancelAnimationFrame',
  ].map((key) => [key, Object.getOwnPropertyDescriptor(global, key)]);
  t.after(() =>
    originals.forEach(([key, descriptor]) => {
      if (descriptor) Object.defineProperty(global, key, descriptor);
      else delete global[key];
    }),
  );
  global.ResizeObserver = class {
    constructor(fn) {
      callback = fn;
    }
    observe(target) {
      observed = target;
    }
    disconnect() {
      disconnected = true;
    }
  };
  global.requestAnimationFrame = (fn) => {
    frames.set(++id, fn);
    return id;
  };
  global.cancelAnimationFrame = (key) => frames.delete(key);
  const element = {
    getBoundingClientRect() {
      throw new Error('Forced geometry read');
    },
  };
  const updates = [];
  const stop = observeChartSize(element, (size) => updates.push(size));
  assert.equal(observed, element);
  assert.deepEqual(updates, [], 'do not mount chart with guessed dimensions');
  const resize = (width, height) =>
    callback([{ target: element, contentRect: { width, height } }]);
  const flush = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((fn) => fn());
  };
  resize(600, 340);
  resize(620, 340);
  assert.equal(frames.size, 1);
  flush();
  assert.deepEqual(updates, [{ width: 620, height: 340 }]);
  resize(620.2, 340.1);
  flush();
  assert.equal(updates.length, 1, 'unchanged rounded size does not rerender');
  resize(0, 0);
  flush();
  assert.deepEqual(updates.at(-1), { width: 0, height: 0 });
  resize(320, 280);
  flush();
  assert.deepEqual(updates.at(-1), { width: 320, height: 280 });
  resize(400, 280);
  stop();
  assert.ok(disconnected);
  assert.equal(frames.size, 0);
  resize(500, 300);
  flush();
  assert.equal(updates.length, 3, 'no updates after unmount');
});

const vm = require('node:vm');
const { createHash } = require('node:crypto');

// Deterministic SVG DOM: capture every displayed attribute on every frame,
// including particles and eye visibility. No network or browser dependency.
function render(source, interval) {
  let now = 1000;
  let seed = 731;
  let writes = 0;
  class Element {
    constructor(tag) {
      this.tag = tag;
      this.attrs = {};
      this.style = {};
      this.children = [];
    }
    setAttribute(name, value) {
      this.attrs[name] = String(value);
      writes++;
    }
    getAttribute(name) {
      return this.attrs[name] ?? null;
    }
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    removeChild(child) {
      this.children.splice(this.children.indexOf(child), 1);
      child.parentNode = null;
    }
    remove() {
      this.parentNode?.removeChild(this);
    }
    snapshot() {
      return [
        this.tag,
        this.attrs,
        this.style,
        this.textContent ?? '',
        this.children.map((child) => child.snapshot()),
      ];
    }
  }
  const math = Object.create(Math);
  math.random = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const context = vm.createContext({
    window: {},
    document: { createElementNS: (_, tag) => new Element(tag) },
    Math: math,
    performance: { now: () => now },
    console,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    clearInterval: () => {},
  });
  vm.runInContext(source, context);
  const container = new Element('div');
  const ball = context.window.GrokBall.create(container, {
    autostart: false,
    lite: false,
  });
  const hash = createHash('sha256');
  let frames = 0;
  for (const emotion of context.window.GrokBall.EMOTIONS) {
    ball.setEmotion(emotion.id);
    for (let t = 0; t < 6500; t += interval) {
      now += interval;
      if (t === 0) ball.setGaze(0.8, -0.4);
      if (t >= 2000 && t < 2000 + interval) ball.clearGaze();
      if (t >= 3000 && t < 3000 + interval) {
        ball.bounce();
        ball.burst(8);
      }
      if (t >= 4000 && t < 4000 + interval) ball.spin(1, 1);
      ball._tick(now);
      hash.update(JSON.stringify(container.snapshot()));
      frames++;
    }
  }
  ball.destroy();
  if (container.children.length) throw new Error('SVG not removed on destroy');
  return {
    hash: hash.digest('hex'),
    writes,
    frames,
    emotions: context.window.GrokBall.EMOTIONS.length,
  };
}
module.exports = { render };

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

function loadTs(file, imports = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  new Function('require', 'module', 'exports', code)(
    name => name.endsWith('.css') ? {} : imports[name] || require(name),
    module, module.exports,
  );
  return module.exports;
}

test('cover framing measures its initial portal stage and commits only confirmed independent frames', async () => {
  const dom = new JSDOM('<div id="host"></div>', {
    url: 'http://localhost/admin/write', pretendToBeVisual: true,
  });
  const win = dom.window;
  const globals = new Map();
  const observers = [];
  class ResizeObserverMock {
    constructor(callback) { this.callback = callback; this.targets = []; this.disconnected = false; observers.push(this); }
    observe(target) { this.targets.push(target); }
    disconnect() { this.disconnected = true; }
  }
  class LoadedImage {
    constructor() { this.naturalWidth = 1200; this.naturalHeight = 800; }
    set src(value) { this.url = value; queueMicrotask(() => this.onload?.()); }
  }
  const values = {
    window: win, document: win.document, localStorage: win.localStorage,
    HTMLElement: win.HTMLElement, HTMLInputElement: win.HTMLInputElement,
    HTMLButtonElement: win.HTMLButtonElement, Element: win.Element,
    Node: win.Node, NodeFilter: win.NodeFilter, DocumentFragment: win.DocumentFragment,
    CustomEvent: win.CustomEvent, Event: win.Event, MutationObserver: win.MutationObserver,
    getComputedStyle: win.getComputedStyle.bind(win),
    requestAnimationFrame: win.requestAnimationFrame.bind(win),
    cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
    ResizeObserver: ResizeObserverMock, Image: LoadedImage, IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [key, value] of Object.entries(values)) {
    globals.set(key, Object.getOwnPropertyDescriptor(global, key));
    Object.defineProperty(global, key, { value, writable: true, configurable: true });
  }
  const bounds = win.HTMLElement.prototype.getBoundingClientRect;
  win.HTMLElement.prototype.getBoundingClientRect = function () {
    return this.classList.contains('cover-framing-viewport')
      ? new win.DOMRect(0, 0, 400, 250) : bounds.call(this);
  };

  const React = require('react');
  const { act } = React;
  const { createRoot } = require('react-dom/client');
  let root;
  const settleFocus = () => act(async () => new Promise(resolve => setTimeout(resolve, 0)));
  try {
    const crop = loadTs('src/app/lib/coverCrop.ts');
    const image = loadTs('src/app/components/CoverImage.tsx', { '../lib/coverCrop': crop });
    const safeUrl = loadTs('src/app/lib/safeUrl.ts');
    const { CoverFramingDialog } = loadTs('src/app/components/CoverFramingDialog.tsx', {
      '../lib/coverCrop': crop, './CoverImage': image, '../lib/safeUrl': safeUrl,
    });
    const initial = { card: { x: .5, y: .5, zoom: 2 }, detail: { x: .7, y: .1, zoom: 1.4 } };
    const commits = [];
    function Harness() {
      const [open, setOpen] = React.useState(false);
      const [saved, setSaved] = React.useState(initial);
      return React.createElement(React.Fragment, null,
        React.createElement('button', { id: 'trigger', onClick: () => setOpen(true) }, 'Open framing'),
        open && React.createElement(CoverFramingDialog, {
          src: '/api/uploads/framing-test.png', value: saved, onClose: () => setOpen(false),
          onConfirm: value => { commits.push(value); setSaved(value); setOpen(false); },
        }),
      );
    }
    const trigger = () => document.getElementById('trigger');
    const stage = () => document.querySelector('.cover-framing-viewport');
    const source = () => document.querySelector('.cover-framing-source');
    const dialog = () => document.querySelector('[role="dialog"]');
    const confirm = () => dialog().querySelector('.cover-framing-confirm');
    const position = () => ({ left: parseFloat(source().style.left), top: parseFloat(source().style.top) });
    const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} differs from ${expected}`);
    async function open() {
      await act(async () => { trigger().focus(); trigger().click(); });
      assert.ok(source(), 'first portal mount must render the loaded source without switching tabs');
      assert.equal(confirm().disabled, false);
      assert.ok(observers.some(observer => observer.targets.includes(stage())), 'mounted portal stage must be observed');
      assert.equal(document.activeElement, dialog().querySelector('.cover-framing-header h2'));
    }
    async function move(key, shiftKey = false) {
      await act(async () => {
        stage().focus();
        stage().dispatchEvent(new win.KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
      });
    }
    async function close(button) {
      await act(async () => button.click());
      // Radix restores focus in a deferred unmount callback.
      await settleFocus();
      assert.equal(dialog(), null);
      assert.equal(document.activeElement, trigger());
    }

    root = createRoot(document.getElementById('host'));
    await act(async () => root.render(React.createElement(Harness)));
    await open();
    const original = position();
    await move('ArrowRight');
    near(position().left - original.left, 10);
    await move('ArrowUp', true);
    near(position().top - original.top, -40);
    await close(dialog().querySelector('.cover-framing-header > button:first-child'));
    assert.deepEqual(commits, [], 'cancel must not commit the temporary frame');

    await open();
    near(position().left, original.left);
    near(position().top, original.top);
    await move('ArrowRight');
    await move('ArrowUp', true);
    const adjusted = position();
    await close(confirm());
    assert.equal(commits.length, 1);
    assert.notDeepEqual(commits[0].card, initial.card);
    assert.deepEqual(commits[0].detail, initial.detail, 'card edits must retain the inactive detail frame');

    await open();
    near(position().left, adjusted.left);
    near(position().top, adjusted.top);
    await act(async () => dialog().querySelector('.cover-framing-controls .cover-framing-button').click());
    assert.equal(dialog().querySelector('input[type="range"]').value, '1');
    assert.equal(commits.length, 1, 'restoring defaults remains temporary until confirmed');
    await close(confirm());
    assert.deepEqual(commits[1], { card: null, detail: initial.detail });
  } finally {
    try {
      if (root) await act(async () => root.unmount());
      await settleFocus();
    } finally {
      try {
        win.HTMLElement.prototype.getBoundingClientRect = bounds;
        dom.window.close();
      } finally {
        for (const [key, descriptor] of globals) {
          if (descriptor) Object.defineProperty(global, key, descriptor);
          else delete global[key];
        }
      }
    }
    assert.ok(observers.every(observer => observer.disconnected), 'all measurement observers must be cleaned up');
  }
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const postcss = require('postcss');

test('pressed buttons retain geometry while surface feedback and panel motion remain', () => {
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (file.endsWith('.css')) postcss.parse(fs.readFileSync(file,'utf8')).walkRules(rule => {
        if (!rule.selector.includes(':active')) return;
        rule.walkDecls(decl => {
          assert.ok(!(decl.prop === 'scale' || (decl.prop === 'transform' && /scale\(/.test(decl.value))), `${file}: ${rule.selector} must not scale on press`);
        });
      });
      else if (/\.(tsx|ts)$/.test(file)) assert.doesNotMatch(fs.readFileSync(file,'utf8'), /whileTap\s*=\s*\{\s*\{[^}]*scale\s*:/, file);
    }
  }
  visit('src');
  const motion = fs.readFileSync('src/styles/motion.css','utf8');
  assert.match(motion, /:active[^\n]*background-color:color-mix/);
  assert.match(motion, /data-state="open".*mooncci-panel-in/);
  assert.match(motion, /data-state="closed".*mooncci-panel-out/);
  assert.doesNotMatch(motion, /scale var\(--motion-control\)/);
  assert.match(fs.readFileSync('src/styles/mailbox.css','utf8'), /mailbox-primary:active[^}]*background:color-mix/);
});

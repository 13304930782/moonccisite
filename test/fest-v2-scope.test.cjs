const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const postcss=require('postcss');

test('festival v2 styles are confined to this page and never define root variables',()=>{
 const sheet=postcss.parse(fs.readFileSync('src/styles/fest-v2.css','utf8'));
 const motionGuard=node=>{for(let p=node.parent;p;p=p.parent)if(p.type==='atrule'&&p.name==='media'&&/prefers-reduced-motion:\s*no-preference/.test(p.params))return true;return false;};
 sheet.walkRules(rule=>{
  if(rule.parent.type==='atrule'&&rule.parent.name==='keyframes'){rule.walkDecls(d=>assert.ok(['opacity','transform'].includes(d.prop),d.toString()));return;}
  assert.ok(!rule.selector.includes(':root'),rule.selector);
  for(const selector of postcss.list.comma(rule.selector))assert.match(selector,/^\.fest-v2(?=[\s:.#>[+~]|$)/,`${rule.source.start.line}: ${selector}`);
 });
 sheet.walkAtRules('keyframes',rule=>{assert.match(rule.params,/^fv-/);assert.ok(motionGuard(rule),'Keyframes require no-preference guard');});
 sheet.walkDecls(decl=>{if(['transition','animation'].includes(decl.prop)&&decl.value!=='none'){assert.ok(motionGuard(decl),`Motion must respect reduced motion: ${decl.toString()}`);if(decl.prop==='transition')for(const item of postcss.list.comma(decl.value))assert.match(item,/^(opacity|transform)\s/);}});
});


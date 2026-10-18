const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const postcss=require('postcss');
const css=postcss.parse(fs.readFileSync('src/styles/updates-v2.css','utf8'));
test('updates CSS remains page-scoped without global variables',()=>{
  css.walkRules(rule=>{
    if(rule.parent.type==='atrule' && /keyframes$/.test(rule.parent.name)) return;
    for(const selector of rule.selectors) assert.ok(selector.trim().startsWith('.updates-v2'),selector);
    assert.ok(!rule.selector.includes(':root'));
  });
});
test('updates animations respect reduced motion and only animate opacity or transform',()=>{
  css.walkDecls(/^animation/,decl=>{
    let parent=decl.parent;
    if(decl.value==='none') return;
    while(parent && !(parent.type==='atrule' && parent.name==='media' && parent.params.includes('prefers-reduced-motion: no-preference'))) parent=parent.parent;
    assert.ok(parent,'animation needs reduced-motion guard');
  });
  css.walkAtRules(/keyframes$/,rule=>rule.walkDecls(decl=>assert.ok(['opacity','transform'].includes(decl.prop))));
});

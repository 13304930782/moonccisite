const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const postcss=require('postcss');
const moduleOutput={exports:{}};
new Function('exports',ts.transpileModule(fs.readFileSync('src/app/lib/electricityPresentation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(moduleOutput.exports);
const {daysProgress,depletionDate,maskedSubscription}=moduleOutput.exports;
test('electricity forecast presentation clamps progress and uses whole business days',()=>{
 for(const [value,ratio,date]of [[0,0,'2026-10-17'],[.8,.8/14,'2026-10-17'],[2.9,2.9/14,'2026-10-19'],[14,1,'2026-10-31'],[20,1,'2026-11-06'],[null,null,null],[undefined,null,null],[NaN,null,null],[Infinity,null,null]]){
  assert.equal(daysProgress(value),ratio);assert.equal(depletionDate('2026-10-17',value),date);
 }
 assert.equal(depletionDate('2026-02-30',2),null);assert.equal(depletionDate(undefined,2),null);
});
test('default RSS display replaces the token instead of merely blurring its real text',()=>{
 const token='private-test-token';const result=maskedSubscription(`https://mooncci.site/api/electricity/rss/feed.xml?token=${token}&roomId=1`);
 assert.equal(result.mask.length,token.length);
 assert.equal(maskedSubscription("https://mooncci.site/?token=abc").mask.length,3);
 assert.equal(maskedSubscription("https://mooncci.site/?token="+"x".repeat(80)).mask.length,80);
 assert.ok(!JSON.stringify(result).includes(token));assert.match(result.before,/token=$/);assert.match(result.after,/roomId=1/);
 for(const url of [null,'',token,'javascript:'+token])assert.ok(!JSON.stringify(maskedSubscription(url)).includes(token));
});
test('electricity redesign CSS stays page scoped and motion respects reduced preference',()=>{
 const root=postcss.parse(fs.readFileSync('src/styles/elec-v2.css','utf8'));
 root.walkRules(rule=>{
  if(rule.parent.type==='atrule'&&rule.parent.name==='keyframes')return;
  for(const selector of rule.selectors){assert.ok(selector.trim().startsWith('.elec-v2'),selector);assert.ok(!selector.includes(':root'),selector);}
 });
 root.walkDecls(/animation/,decl=>{
  if(decl.value==='none')return;
  let node=decl.parent,allowed=false;
  while(node){if(node.type==='atrule'&&node.name==='media'&&/prefers-reduced-motion:\s*no-preference/.test(node.params))allowed=true;node=node.parent;}
  assert.ok(allowed,decl.toString());
 });
});

const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('fs');
function load(name){const m={exports:{}};new Function('require','exports','module',ts.transpileModule(fs.readFileSync('src/app/lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(require,m.exports,m);return m.exports;}
const {distinctArticleSummary}=load('articleSummary'),{highlightCode}=load('codeHighlight');
test('hide imported truncated excerpts while preserving independent summaries',()=>{
 assert.equal(distinctArticleSummary('一、数组 1...','一、数组\n\n1.定义方式\n\n代码'), '');
 assert.equal(distinctArticleSummary('一、数组 1…','## 一、数组\n\n1. 定义方式'), '');
 assert.equal(distinctArticleSummary('一、数组','一、数组\n\n正文'), '');
 assert.equal(distinctArticleSummary('数组的定义和实际用法','一、数组\n\n1.定义方式'), '数组的定义和实际用法');
 assert.equal(distinctArticleSummary('说明','说明另一件事情'), '说明');
});
test('explicit languages, aliases, automatic recognition and plaintext fallback',()=>{
 assert.equal(highlightCode('const value = 42;','js').label,'JavaScript');
 assert.match(highlightCode('int main(void) { return 0; }','c').html,/hljs-keyword/);
 const auto=highlightCode('def greet(name):\n    print("Hello", name)\n    return True\n');assert.equal(auto.label,'Python');assert.equal(auto.automatic,true);
 assert.equal(highlightCode('second').html,null);
 assert.equal(highlightCode('def f(): return True','text').html,null);
 assert.equal(highlightCode('anything','unknown').html,null);
 assert.equal(highlightCode('x'.repeat(50001),'js').html,null);
});
test('highlighted HTML escapes article code instead of executing it',()=>{
 const result=highlightCode('<script>alert(1)</script><img src=x onerror=alert(1)>','html');
 assert.ok(!result.html.includes('<script>'));assert.ok(!result.html.includes('<img '));assert.match(result.html,/&lt;/);
});

test('summary comparison handles nested markup without emitting transformed HTML',()=>{
 const summary='<scrip<script>removed</script>t>alert(1)</script>';
 assert.equal(distinctArticleSummary(summary,'An unrelated article'),summary);
 assert.equal(distinctArticleSummary('<b>abcdefghijklmnop</b>...', 'abcdefghijklmnop and more'), '');
});

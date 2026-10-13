const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const mod={exports:{}};
new Function('exports','module',ts.transpileModule(fs.readFileSync('src/app/lib/focusLoop.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(mod.exports,mod);
const {focusableWithin,loopFocus}=mod.exports;
function fixture(){
 const dom=new JSDOM('<button id="outside">菜单</button><div id="panel" tabindex="-1"><a id="first" href="/articles">文章</a><button disabled>不可用</button><div hidden><a href="/hidden">隐藏</a></div><details><summary id="account">mooncci</summary><a href="/account">个人设置</a></details><button id="last">登录</button></div>');
 return {dom,document:dom.window.document,panel:dom.window.document.getElementById('panel')};
}
test('menu traversal skips disabled, hidden and collapsed account actions',()=>{
 const {dom,panel}=fixture();try{
  assert.deepEqual(focusableWithin(panel).map(e=>e.id),['first','account','last']);
  panel.querySelector('details').open=true;assert.equal(focusableWithin(panel).length,4);
  panel.querySelector('details').style.display='none';assert.deepEqual(focusableWithin(panel).map(e=>e.id),['first','last']);
 }finally{dom.window.close();}
});
test('Tab and Shift+Tab wrap at menu boundaries and recover focus from the header',()=>{
 const {dom,document,panel}=fixture();try{
  const press=shiftKey=>{const event=new dom.window.KeyboardEvent('keydown',{key:'Tab',shiftKey,cancelable:true});loopFocus(event,panel);return event.defaultPrevented;};
  document.getElementById('last').focus();assert.equal(press(false),true);assert.equal(document.activeElement.id,'first');
  assert.equal(press(true),true);assert.equal(document.activeElement.id,'last');
  document.getElementById('outside').focus();assert.equal(press(false),true);assert.equal(document.activeElement.id,'first');
  document.getElementById('account').focus();assert.equal(press(false),false);
 }finally{dom.window.close();}
});

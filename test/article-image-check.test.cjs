const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
test('publication image check reuses decoded previews and distinguishes failure from timeout',async()=>{
 const images=[],timers=new Map();let sequence=0;
 class Image {constructor(){images.push(this);this.naturalWidth=0;}removeAttribute(name){if(name==='src')this.src='';}}
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/lib/checkArticleImage.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Image,setTimeout:(fn,ms)=>{const id=++sequence;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});
 const {checkArticleImage}=exports;
 assert.equal(await checkArticleImage('/ok',[{src:'/ok',complete:true,naturalWidth:100}]),'loaded');assert.equal(images.length,0);
 const pending=checkArticleImage('/slow',[]);assert.equal([...timers.values()][0].ms,20000);images.at(-1).naturalWidth=100;images.at(-1).onload();assert.equal(await pending,'loaded');assert.equal(timers.size,0);
 const failed=checkArticleImage('/missing',[]);images.at(-1).onerror();assert.equal(await failed,'failed');assert.equal(timers.size,0);
 const timeout=checkArticleImage('/timeout',[]);[...timers.values()][0].fn();assert.equal(await timeout,'timeout');assert.equal(images.at(-1).src,'');assert.equal(images.at(-1).onload,null);
 const retry=checkArticleImage('/timeout',[]);images.at(-1).naturalWidth=100;images.at(-1).onload();assert.equal(await retry,'loaded');
});

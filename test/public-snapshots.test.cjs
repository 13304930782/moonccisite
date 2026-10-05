const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
test('snapshots expire, stay bounded and reject results from before invalidation',()=>{
 const module={exports:{}};let now=0;
 const code=ts.transpileModule(fs.readFileSync('src/app/lib/publicSnapshots.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('exports','Date',code)(module.exports,{now:()=>now});const m=module.exports;
 for(let i=0;i<41;i++)m.writeSnapshot('/posts?page='+i,i,m.snapshotGeneration());
 assert.equal(m.readSnapshot('/posts?page=0'),null);assert.equal(m.readSnapshot('/posts?page=40'),40);
 now=30000;assert.equal(m.readSnapshot('/posts?page=40'),null);
 const old=m.snapshotGeneration();m.clearPublicSnapshots();m.writeSnapshot('/posts','late published copy',old);assert.equal(m.readSnapshot('/posts'),null);
 m.writeSnapshot('/posts','fresh',m.snapshotGeneration());assert.equal(m.readSnapshot('/posts'),'fresh');
});

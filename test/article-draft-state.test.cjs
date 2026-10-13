const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs');
const mod={exports:{}};
new Function('exports','module',ts.transpileModule(fs.readFileSync('src/app/lib/articleDraftState.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(mod.exports,mod);
const {draftSnapshot,settleDraftSave}=mod.exports;
test('database key order does not mark a saved AI draft dirty or create a recovery conflict',()=>{
 const editor={title:'文章',content:'正文',summary_mode:'ai',summary_receipt:'receipt',tags:['数组','C']};
 const server={tags:['数组','C'],summary_receipt:'receipt',content:'正文',title:'文章',summary_mode:'ai'};
 assert.notEqual(JSON.stringify(editor),JSON.stringify(server));assert.equal(draftSnapshot(editor),draftSnapshot(server));
 for(const change of [{content:'新正文'},{summary_receipt:'new'},{summary_mode:'manual'},{tags:['C','数组']}])assert.notEqual(draftSnapshot(editor),draftSnapshot({...server,...change}));
});
test('a successful save adopts the actual stored normalization and becomes clean',()=>{
 const sent={title:'文章',summary:'AI 简介',tags:['数组',''],published_at:'2025-10-18T20:14:13'};
 const server={published_at:'2025-10-18 20:14:13',tags:['数组'],summary:'AI 简介',title:'文章'};
 const current={...sent};
 const settled=settleDraftSave(current,sent,server);
 assert.equal(settled,server);assert.equal(draftSnapshot(settled),draftSnapshot(server));
});
test('typing while a save is pending preserves every newer edit for the next save',()=>{
 const sent={title:'文章',content:'旧正文',summary:'简介',tags:[]};
 const server={...sent};
 for(const change of [{title:'新标题'},{content:'新正文'},{summary:'新简介'},{tags:['新标签']}]){
  const current={...sent,...change};
  assert.equal(settleDraftSave(current,sent,server),current);
  assert.notEqual(draftSnapshot(current),draftSnapshot(server));
 }
});

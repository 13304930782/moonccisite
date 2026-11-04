const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
let preserves;
test.before(async()=>{const result=await require('esbuild').build({entryPoints:['src/app/lib/useUnsavedLeave.ts'],bundle:true,external:['react'],write:false,format:'cjs',platform:'node'});const context={module:{exports:{}},require,URLSearchParams};vm.runInNewContext(result.outputFiles[0].text,context);preserves=context.module.exports.preservesFormNavigation;});
const page=(pathname,search='',state={})=>({pathname,search,hash:'',state});
test('language replacement preserves unsaved forms but ordinary navigation remains guarded',()=>{
 assert.equal(preserves({historyAction:'REPLACE',currentLocation:page('/article/a'),nextLocation:page('/en/article/a')}),true);
 for(const [action,next] of [['PUSH','/en/article/a'],['REPLACE','/en/article/b']])assert.equal(preserves({historyAction:action,currentLocation:page('/article/a'),nextLocation:page(next)}),false);
});
test('only explicitly marked same-editor draft IDs bypass leave confirmation',()=>{
 const currentLocation=page('/admin/write','?draft=1&filter=mine');
 assert.equal(preserves({historyAction:'REPLACE',currentLocation,nextLocation:page('/admin/write','?draft=1&filter=mine&draft_en=2',{mooncciDraftIdentity:true})}),true);
 for(const next of [page('/admin/write','?draft_en=2'),page('/admin/write','?draft=1&filter=all&draft_en=2',{mooncciDraftIdentity:true}),page('/admin/posts','?draft=1&filter=mine',{mooncciDraftIdentity:true})])assert.equal(preserves({historyAction:'REPLACE',currentLocation,nextLocation:next}),false);
});

const {test}=require('node:test'),assert=require('node:assert/strict');
test('distributed license notices are deduplicated and never silently omitted',async()=>{
 const {licenseNotices}=await import('../scripts/license-notices.mjs');const plugin=licenseNotices();plugin.buildStart();
 assert.throws(()=>plugin.generateBundle.call({emitFile(){}}),/empty/);
 const notice='/** @license Example MIT Copyright Example Authors */';
 plugin.renderChunk(notice+'\nvar x=1;');plugin.renderChunk(notice+'\n/** Copyright Other Authors */');
 let artifact;plugin.generateBundle.call({emitFile(a){artifact=a;}});
 assert.equal(artifact.fileName,'THIRD_PARTY_LICENSES.txt');assert.equal(artifact.source.split(notice).length,2);assert.match(artifact.source,/Other Authors/);assert.match(artifact.source,/Copyright \(c\) 2025 Tiptap/);
});

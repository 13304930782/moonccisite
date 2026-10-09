const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
fs.mkdirSync('.cache',{recursive:true});
require('esbuild').buildSync({entryPoints:['src/app/lib/remarkGfmRead.ts'],bundle:true,platform:'node',format:'esm',packages:'external',outfile:'.cache/gfm-read-tests.mjs'});
test('read-only GFM preserves the upstream parse tree for article syntax',async()=>{
 const {unified}=await import('unified');const {default:parse}=await import('remark-parse');
 const {default:full}=await import('remark-gfm');const {default:read}=await import('../.cache/gfm-read-tests.mjs');
 const samples=['# Title\n\n~~removed~~ and https://example.com','- [x] Done\n- [ ] Todo','| A | B |\n| :-- | --: |\n| a | b |','Reference[^note]\n\n[^note]: footnote','![alt](/api/uploads/a.png)\n\n```js\na < b\n```','<p>legacy HTML</p>'];
 for(const source of samples){assert.deepEqual(unified().use(parse).use(read).parse(source),unified().use(parse).use(full).parse(source));}
 const processor=unified().use(parse).use(read).freeze();assert.equal(processor.data().toMarkdownExtensions,undefined);
});

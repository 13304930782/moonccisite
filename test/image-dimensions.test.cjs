const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs');
const m={exports:{}};
new Function('exports','module',ts.transpileModule(fs.readFileSync('src/app/lib/imageDimensions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(m.exports,m);
const {dimensionsFor}=m.exports;
test('local dimensions preserve aspect ratio; query strings work and old responses fall back',()=>{
 const sizes={'/api/uploads/a.webp':{width:400,height:900}};
 assert.deepEqual(dimensionsFor('/api/uploads/a.webp?v=2#x',sizes),{width:400,height:900});
 for(const src of ['https://elsewhere.test/api/uploads/a.webp','//elsewhere.test/api/uploads/a.webp','/api/uploads/a.webp/other',undefined])assert.deepEqual(dimensionsFor(src,sizes),{});
 assert.deepEqual(dimensionsFor('/api/uploads/a.webp'),{});
 for(const size of [{width:0,height:30},{width:Infinity,height:4},{width:1.5,height:2},{width:'400',height:900}])assert.deepEqual(dimensionsFor('/api/uploads/a.webp',{'/api/uploads/a.webp':size}),{});
});

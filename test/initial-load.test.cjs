const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs');
function load(file, window, document) {
 const m={exports:{}};
 new Function('exports','module','window','document',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(m.exports,m,window,document);
 return m.exports;
}
test('background loading waits for load and grace period, and cancels on unmount',()=>{
 let onload,timer,idle,calls=0;
 const window={addEventListener:(event,fn)=>{onload=fn},removeEventListener:()=>{onload=null},setTimeout:fn=>{timer=fn;return 1},clearTimeout:()=>{timer=null},requestIdleCallback:fn=>{idle=fn;return 2},cancelIdleCallback:()=>{idle=null}};
 const {afterInitialLoad}=load('src/app/lib/afterInitialLoad.ts',window,{readyState:'loading'});
 const cancel=afterInitialLoad(()=>calls++);
 assert.equal(timer,undefined);onload();assert.equal(calls,0);timer();assert.equal(calls,0);idle();assert.equal(calls,1);cancel();assert.equal(idle,null);
 const stop=afterInitialLoad(()=>calls++);onload();timer();const queued=idle;stop();queued();assert.equal(calls,1);
});
test('responsive images only transform local raster uploads',()=>{
 const {responsiveImage}=load('src/app/lib/responsiveImage.ts');
 assert.match(responsiveImage('/api/uploads/a.webp').srcSet,/540w/);
 assert.equal(responsiveImage('/api/uploads/a.webp',true).sizes,'26px');
 for(const src of ['https://other.test/a.webp','/api/uploads/a.svg','/api/uploads/a.gif','/api/uploads/../a.webp'])assert.deepEqual(responsiveImage(src),{src});
});

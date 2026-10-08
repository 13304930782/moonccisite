const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs');
const m={exports:{}};
new Function('exports','module',ts.transpileModule(fs.readFileSync('src/app/lib/weatherGeolocation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m.exports,m);
const {locateWeatherDevice}=m.exports;
const position={coords:{latitude:30.274,longitude:120.155,accuracy:5000}};
test('desktop coarse fix is accepted and every user action requests a fresh position',async()=>{
 const options=[];
 assert.equal(await locateWeatherDevice({getCurrentPosition:(ok,_fail,opts)=>{options.push(opts);ok(position)}}),position);
 assert.deepEqual(options,[{enableHighAccuracy:true,timeout:12000,maximumAge:0}]);
});
test('unavailable or timed-out fix retries once; permission denial never retries',async()=>{
 for(const code of [2,3]){
  let calls=0;
  assert.equal(await locateWeatherDevice({getCurrentPosition:(ok,fail,opts)=>{if(++calls===1)fail({code});else{assert.equal(opts.enableHighAccuracy,false);assert.equal(opts.maximumAge,0);ok(position)}}}),position);
  assert.equal(calls,2);
 }
 let calls=0;
 await assert.rejects(locateWeatherDevice({getCurrentPosition:(_ok,fail)=>{calls++;fail({code:1})}}),e=>e.code===1);
 assert.equal(calls,1);
});
test('cancelled location does not retry or replace a later manual selection',async()=>{
 const controller=new AbortController();let calls=0,fail;
 const pending=locateWeatherDevice({getCurrentPosition:(_ok,onError)=>{calls++;fail=onError}},controller.signal);
 controller.abort();fail({code:3});
 await assert.rejects(pending,e=>e.name==='AbortError');
 assert.equal(calls,1);
});

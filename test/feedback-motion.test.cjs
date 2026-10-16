const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function fixture(){
 const exports={},win=new EventTarget(),media=new EventTarget();media.matches=false;
 let reduced=false,calls=0,cancels=0,finish,throws=false;
 const animate=()=>{calls++;if(throws)throw Error('unsupported');return{cancel(){cancels++;},then(done){finish=done;}};};
 const code=ts.transpileModule(fs.readFileSync('src/app/lib/feedbackMotion.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('exports','require','window','matchMedia',code)(exports,id=>id==='motion/mini'?{animate}:{reducedMotion:()=>reduced},win,()=>media);
 return{run:exports.feedbackMotion,win,media,setReduced:value=>{reduced=value;},setThrows:()=>{throws=true;},done:()=>finish?.(),counts:()=>({calls,cancels})};
}
test('motion is optional, completion and interrupted cleanup release only their own animation',()=>{
 const f=fixture(),element={animate(){}};
 const first=f.run(element,{opacity:[0,1]});assert.deepEqual(f.counts(),{calls:1,cancels:0});first();f.done();assert.equal(f.counts().cancels,1);
 f.run(element,{opacity:[0,1]});f.done();assert.equal(f.counts().cancels,2);
 f.setReduced(true);f.run(element,{opacity:[0,1]})();assert.equal(f.counts().calls,2);
 f.setReduced(false);f.run({},{});assert.equal(f.counts().calls,2);
 f.setThrows();assert.doesNotThrow(()=>f.run(element,{}));
});
test('system or site preference changes cancel an in-flight effect immediately',()=>{
 for(const source of ['system','site']){const f=fixture();f.run({animate(){}},{opacity:[0,1]});f.setReduced(true);(source==='system'?f.media:f.win).dispatchEvent(new Event(source==='system'?'change':'mooncci:motion-change'));assert.equal(f.counts().cancels,1);f.done();assert.equal(f.counts().cancels,1);}
});

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
global.IntersectionObserver=undefined;global.window=undefined;
const exportsObject={};new Function('exports',ts.transpileModule(fs.readFileSync('src/app/lib/electricityMotion.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exportsObject);
test('electricity reveals visible rows only after scroll settles, once, with cleanup',t=>{
 t.mock.timers.enable({apis:['setTimeout']});const rows=[{dataset:{}},{dataset:{}}];let callback,scroll,disconnected=false;const unobserved=[];
 t.mock.property(global,'IntersectionObserver',class{constructor(cb){callback=cb}observe(){}unobserve(n){unobserved.push(n)}disconnect(){disconnected=true}});
 t.mock.property(global,'window',{addEventListener(_e,fn){scroll=fn},removeEventListener(_e,fn){if(scroll===fn)scroll=null}});
 const stop=exportsObject.observeElectricityReveals({querySelectorAll:()=>rows},false);
 const emit=(n,ratio)=>callback([{target:n,isIntersecting:ratio>0,intersectionRatio:ratio}]);
 emit(rows[0],1);t.mock.timers.tick(150);scroll();t.mock.timers.tick(150);assert.equal(rows[0].dataset.visible,'false');
 emit(rows[0],0);t.mock.timers.tick(200);assert.equal(rows[0].dataset.visible,'false');
 emit(rows[1],.4);t.mock.timers.tick(200);assert.equal(rows[1].dataset.visible,'false');
 emit(rows[0],.8);t.mock.timers.tick(200);assert.equal(rows[0].dataset.visible,'true');assert.deepEqual(unobserved,[rows[0]]);
 emit(rows[1],1);stop();t.mock.timers.tick(400);assert.equal(rows[1].dataset.visible,'false');assert.equal(disconnected,true);assert.equal(scroll,null);
});
test('reduced motion and unavailable observers reveal immediately',t=>{
 t.mock.property(global,'IntersectionObserver',undefined);
 for(const reduce of [true,false]){const row={dataset:{}};exportsObject.observeElectricityReveals({querySelectorAll:()=>[row]},reduce)();assert.equal(row.dataset.visible,'true');}
});

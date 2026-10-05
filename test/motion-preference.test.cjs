const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), ts=require('typescript');
test('system reduction wins, legacy preferences work, runtime updates and cleanup work',()=>{
 const module={exports:{}}, root={dataset:{}}, media=new EventTarget(), win=new EventTarget();media.matches=false;
 let saved='{"size":18}', changes=0;win.addEventListener('mooncci:motion-change',()=>changes++);
 const code=ts.transpileModule(fs.readFileSync('src/app/lib/motionPreference.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('exports','document','window','matchMedia','localStorage',code)(module.exports,{documentElement:root},win,()=>media,{getItem:()=>saved});
 const dispose=module.exports.installMotionPreference();assert.equal(module.exports.reducedMotion(),false);
 saved='{"reduceMotion":true}';module.exports.syncMotionPreference();assert.equal(module.exports.reducedMotion(),true);
 saved='{}';media.matches=true;media.dispatchEvent(new Event('change'));assert.equal(root.dataset.reducedMotion,'true');
 media.matches=false;media.dispatchEvent(new Event('change'));assert.equal(root.dataset.reducedMotion,'false');
 dispose();const count=changes;media.dispatchEvent(new Event('change'));assert.equal(changes,count);
});

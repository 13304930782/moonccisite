const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('seasonal budget caps entry/payload and rejects extra network dependencies',async()=>{
 const {seasonalBudget}=await import('../../../../../scripts/check-bundle-budget.mjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'halloween-budget-'));
 const entry='src/app/components/Halloween/Decorations.tsx',manifest={'index.html':{file:'index.js',isEntry:true},[entry]:{file:'holiday.js',isDynamicEntry:true,imports:['index.html']}};
 const limits={baselineEntryJsBytes:100,baselineEntryJsGzipBytes:50,entryIncreaseGzipBytes:1000,decorationGzipBytes:8000};
 const size={entryJsBytes:200,entryJsGzipBytes:60,totalJsBytes:300,totalJsGzipBytes:200};
 const save=()=>fs.writeFileSync(path.join(dir,'asset-manifest.json'),JSON.stringify(manifest));
 try{
  fs.writeFileSync(path.join(dir,'holiday.js'),'export default 1;');save();
  assert.equal(seasonalBudget(dir,size,limits).seasonal.entryIncreaseGzipBytes,10);
  assert.throws(()=>seasonalBudget(dir,{...size,entryJsGzipBytes:1051},limits),/exceeds/);
  assert.throws(()=>seasonalBudget(dir,size,{...limits,decorationGzipBytes:1}),/exceeds/);
  manifest[entry].css=['holiday.css'];save();assert.throws(()=>seasonalBudget(dir,size,limits),/one lazy/);
  delete manifest[entry].css;manifest[entry].imports=['new.js'];save();assert.throws(()=>seasonalBudget(dir,size,limits),/one lazy/);
  delete manifest[entry];save();assert.throws(()=>seasonalBudget(dir,size,limits),/Missing registered/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {defaults, evaluate, catalog} = require('../server/src/lib/festivals');
const code = require('esbuild').buildSync({entryPoints:['src/app/pages/festivals-v2/model.ts'],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const loaded = {exports:{}};
new Function('module','exports',code)(loaded,loaded.exports);
const m = loaded.exports;
const iso = date => new Date(`${date}T00:00:00+08:00`).toISOString();
test('Shanghai date formatting and calendar remaining days use exclusive end',()=>{
 assert.equal(m.shanghaiInput('2026-12-31T16:00:00Z'),'2027-01-01T00:00');
 assert.equal(m.fromShanghai('2027-01-01T00:00'),'2026-12-31T16:00:00.000Z');
 assert.equal(m.daysUntil(iso('2027-01-01'),'2026-12-31T15:59:00Z'),1);
 assert.equal(m.daysUntil(iso('2026-10-31'),'2026-10-31T03:00:00Z'),0);
 assert.equal(m.daysRemaining(iso('2026-11-02'),'2026-11-01T15:59:59Z'),1);
 assert.equal(m.daysRemaining(iso('2026-11-02'),iso('2026-11-02')),0);
 assert.equal(m.daysRemaining('2026-11-01T06:00:00Z','2026-11-01T02:00:00Z'),1);
 assert.equal(m.daysRemaining('2026-10-29T04:00:00Z','2026-10-28T04:00:00Z'),1);
 assert.equal(m.daysRemaining('bad',iso('2026-01-01')),null);
 assert.equal(m.displayDate('bad'),'—');
});
test('timeline clips crossing years and handles leap years, same-day windows and warmup',()=>{
 const before = m.timelinePosition({start:iso('2025-12-30'),end:iso('2026-01-03')},2026);
 assert.equal(before.left,0); assert.equal(before.width,2/365*100);
 const after = m.timelinePosition({start:iso('2026-12-31'),end:iso('2027-01-03')},2026);
 assert.equal(after.left,364/365*100); assert.equal(after.width,1/365*100);
 assert.equal(m.timelinePosition({start:iso('2028-02-29'),end:iso('2028-03-01')},2028).width,1/366*100);
 assert.equal(m.timelinePosition({start:iso('2026-01-01'),end:iso('2026-01-01')},2026),null);
 const config = defaults().modules.halloween;
 assert.deepEqual(m.moduleWindow('halloween',iso('2026-10-25'),config),{id:'halloween',start:iso('2026-10-25'),end:iso('2026-11-02')});
 assert.deepEqual(m.parseWindowLabel('2026-10-25 — 2026-11-01'),{start:iso('2026-10-25'),end:iso('2026-11-02')});
});
test('annual timeline uses existing evaluator for lunar, floating and exception dates',async()=>{
 const config=defaults(); let requests=0;
 config.modules.christmas.warmupDays=60;
 config.modules.christmas.extensionDays=60;
 config.modules.christmas.exceptions={'2026':'2026-01-05','2027':'2027-01-10'};
 config.modules.halloween.exceptions={'2026':null};
 const windows=await m.loadYearWindows(config,2026,async(c,at)=>{requests++;return evaluate(c,Date.parse(at));});
 assert.ok(requests<=catalog.length*3+1);
 assert.ok(windows.some(w=>w.id==='spring-festival'&&w.start===iso('2026-02-17')));
 assert.ok(windows.some(w=>w.id==='easter'&&w.start===iso('2026-04-05')));
 assert.ok(windows.some(w=>w.id==='thanksgiving'&&w.start===iso('2026-11-26')));
 assert.ok(windows.some(w=>w.id==='christmas'&&w.start===iso('2025-11-06')));
 assert.ok(windows.some(w=>w.id==='christmas'&&w.start===iso('2026-11-11')));
 assert.equal(windows.some(w=>w.id==='halloween'),false);
 assert.ok(windows.every(w=>m.timelinePosition(w,2026)));
});
test('next calendar holiday includes unimplemented entries but excludes disabled and past starts',()=>{
 const config=defaults();
 config.modules.thanksgiving.enabled=false;
 const data={config,catalog,state:evaluate(config,Date.parse(iso('2026-11-02')))};
 assert.equal(m.nextFestival(data).id,'christmas');
 assert.equal(m.nextFestival(data).implemented,false);
 assert.equal(m.ruleSummary(config.modules.halloween.rule),'10月31日 · 持续 1 天');
});
test('timeline request failures are visible and invalid years are rejected',async()=>{
 await assert.rejects(()=>m.loadYearWindows(defaults(),2026,async()=>{throw new Error('网络失败');}),/网络失败/);
 await assert.rejects(()=>m.loadYearWindows(defaults(),2024,async()=>{}),/2025/);
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {defaults,evaluate}=require('../../../../../server/src/lib/festivals');
for(const timezone of ['UTC','America/Los_Angeles','Asia/Shanghai'])test(`shared Shanghai scheduler boundaries independent of host ${timezone}`,()=>{
 const previous=process.env.TZ;process.env.TZ=timezone;
 try{for(const [date,want]of [
 ['2026-10-24T23:59:59+08:00',false],['2026-10-25T00:00:00+08:00',true],
 ['2026-10-31T12:00:00+08:00',true],['2026-11-01T23:59:59+08:00',true],
 ['2026-11-02T00:00:00+08:00',false],['2027-10-25T00:00:00+08:00',true],
 ['2026-01-01T00:00:00+08:00',false]])assert.equal(evaluate(defaults(),Date.parse(date)).active?.id==='halloween',want,date);
 }finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});

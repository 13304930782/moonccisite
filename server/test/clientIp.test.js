const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {clientIp}=require('../src/lib/clientIp');
test('comment attribution ignores visitor CF and real-IP headers and follows trusted proxy policy',async t=>{
 const app=express();app.set('trust proxy','loopback');app.get('/',(req,res)=>res.json({ip:clientIp(req)}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const r=await fetch('http://127.0.0.1:'+server.address().port,{headers:{'X-Forwarded-For':'198.51.100.10','CF-Connecting-IP':'203.0.113.99','X-Real-IP':'203.0.113.98'}});
 assert.deepEqual(await r.json(),{ip:'198.51.100.10'});
});

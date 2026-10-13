const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {createAnonymousHomeCache}=require('../src/lib/anonymousHomeCache');
test('anonymous home: concurrent reads share rendering; credentials, query, errors bypass; expiry refreshes',async t=>{
 let now=0,renders=0,fail=false,cookie=false;
 const app=express();app.use(createAnonymousHomeCache({now:()=>now}));app.get('*',async(req,res)=>{renders++;await new Promise(r=>setTimeout(r,15));res.set('Cache-Control','private, no-store');if(cookie)res.cookie('test','x');res.locals.publicHomeComplete=!fail;res.status(fail?503:200).type('html').send('<main>'+renders+'</main>');});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;
 const all=await Promise.all(Array.from({length:5},()=>fetch(base)));assert.equal(renders,1);for(const r of all)assert.match(r.headers.get('cache-control'),/s-maxage=15/);
 const hit=await fetch(base,{method:'HEAD'});assert.equal(hit.headers.get('x-home-cache'),'HIT');assert.equal(await hit.text(),'');
 for(const headers of [{cookie:'mooncci_token=test'},{authorization:'Bearer x'},{'proxy-authorization':'x'},{range:'bytes=0-4'}]){const r=await fetch(base,{headers});assert.equal(r.headers.get('cache-control'),'private, no-store');}
 assert.equal((await fetch(base+'/?preview=1')).headers.get('cache-control'),'private, no-store');
 now=16000;fail=true;assert.equal((await fetch(base)).status,503);fail=false;assert.equal((await fetch(base)).headers.get('x-home-cache'),'MISS');
 now+=16000;cookie=true;await fetch(base);cookie=false;assert.equal((await fetch(base)).headers.get('x-home-cache'),'MISS');
});

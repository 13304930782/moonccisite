const test=require('node:test'),assert=require('node:assert/strict');
test('reader caches only explicit healthy anonymous home and honors age',async t=>{
 const {createReader}=await import('../edge/reader/server.mjs');let count=0,policy='public, max-age=0, s-maxage=15, must-revalidate',age='14';const key='a'.repeat(64);
 const server=createReader({origin:'https://origin.example.test',key,dist:'.',fetcher:async()=>{count++;return new Response('home',{headers:{'cache-control':policy,'content-type':'text/html',age}})}});server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port,headers={'x-mooncci-reader-key':key};
 await fetch(base,{headers});assert.equal((await fetch(base,{headers})).headers.get('x-home-cache'),'EDGE-HIT');assert.equal(count,1);
 assert.equal((await fetch(base,{headers:{...headers,cookie:'session=secret'}})).status,403);
 await new Promise(r=>setTimeout(r,1050));policy='private, no-store';await fetch(base,{headers});await fetch(base,{headers});assert.equal(count,3);
});
test('reader preserves baseline document protection on success and upstream failure',async t=>{
 const {createReader}=await import('../edge/reader/server.mjs');let fail=false;const key='a'.repeat(64);
 const server=createReader({origin:'https://origin.example.test',key,dist:'.',fetcher:async()=>{if(fail)throw Error('offline');return new Response('<h1>home</h1>',{headers:{'content-type':'text/html'}});}});
 server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;
 for(const failure of [false,true]){fail=failure;const r=await fetch(base,{headers:{'x-mooncci-reader-key':key}});assert.equal(r.status,failure?502:200);assert.equal(r.headers.get('x-frame-options'),'SAMEORIGIN');assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.match(r.headers.get('strict-transport-security'),/max-age=31536000/);assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'self'/);}
});

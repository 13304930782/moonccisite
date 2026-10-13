const test=require('node:test'),assert=require('node:assert/strict');
test('reader caches only explicit healthy anonymous home and honors age',async t=>{
 const {createReader}=await import('../edge/reader/server.mjs');let count=0,policy='public, max-age=0, s-maxage=15, must-revalidate',age='14';const key='a'.repeat(64);
 const server=createReader({origin:'https://origin.example.test',key,dist:'.',fetcher:async()=>{count++;return new Response('home',{headers:{'cache-control':policy,'content-type':'text/html',age}})}});server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port,headers={'x-mooncci-reader-key':key};
 await fetch(base,{headers});assert.equal((await fetch(base,{headers})).headers.get('x-home-cache'),'EDGE-HIT');assert.equal(count,1);
 assert.equal((await fetch(base,{headers:{...headers,cookie:'session=secret'}})).status,403);
 await new Promise(r=>setTimeout(r,1050));policy='private, no-store';await fetch(base,{headers});await fetch(base,{headers});assert.equal(count,3);
});

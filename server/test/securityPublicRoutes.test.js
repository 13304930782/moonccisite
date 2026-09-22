const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {createSeoRouter}=require('../src/routes/seo');
const {attachDiscovery}=require('../src/lib/articleDiscovery');
async function listen(t,app){const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));return 'http://127.0.0.1:'+server.address().port;}
test('SEO documents and sitemap share a rate limit before database and file access',async t=>{
 let reads=0;const db={query:async()=>{reads++;return [[]]}};
 const app=express();app.use(createSeoRouter({db,readTemplate:async()=>'<html><head></head><body><div id="root"></div></body></html>'}));
 const base=await listen(t,app);
 for(let i=0;i<120;i++)assert.equal((await fetch(base+'/sitemap.xml')).status,200);
 const before=reads;
 for(const path of ['/sitemap.xml','/articles','/api/seo']){const response=await fetch(base+path);assert.equal(response.status,429);assert.ok(response.headers.get('retry-after'));}
 assert.equal(reads,before);
});
test('archive and discovery limits reject excessive requests before querying',async t=>{
 let reads=0;const router=require('../src/lib/asyncRouter')();attachDiscovery(router,{query:async()=>{reads++;return [[]]}});
 const app=express();app.use(router);const base=await listen(t,app);
 for(let i=0;i<60;i++)assert.equal((await fetch(base+'/archives')).status,200);
 const before=reads;
 for(const path of ['/archives','/1/discovery'])assert.equal((await fetch(base+path)).status,429);
 assert.equal(reads,before);
});

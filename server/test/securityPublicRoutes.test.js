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

test('SEO limits isolate forwarded clients and do not consume unrelated API requests',async t=>{
 const app=express();app.set('trust proxy','loopback');
 app.use(createSeoRouter({db:{query:async()=>[[]]}}));
 app.get('/api/health',(_req,res)=>res.json({ok:true}));
 const base=await listen(t,app);
 const first={'X-Forwarded-For':'198.51.100.10'},second={'X-Forwarded-For':'198.51.100.11'};
 for(let i=0;i<125;i++)assert.equal((await fetch(base+'/api/health',{headers:first})).status,200);
 for(let i=0;i<120;i++)assert.equal((await fetch(base+'/sitemap.xml',{headers:first})).status,200);
 assert.equal((await fetch(base+'/sitemap.xml',{headers:first})).status,429);
 assert.equal((await fetch(base+'/sitemap.xml',{headers:second})).status,200);
 assert.equal((await fetch(base+'/api/health',{headers:first})).status,200);
});

test('SEO Nginx proxy locations forward client addresses',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const config=fs.readFileSync(path.join(__dirname,'../../scripts/nginx-blog-seo.conf'),'utf8');
 const blocks=[...config.matchAll(/location\s+[^\{]+\{([^}]+)\}/g)].map(match=>match[1]).filter(body=>body.includes('proxy_pass'));
 assert.equal(blocks.length,5);
 for(const block of blocks)assert.match(block,/proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;/);
});

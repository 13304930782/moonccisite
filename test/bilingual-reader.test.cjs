const test=require('node:test'),assert=require('node:assert/strict');
test('reader accepts locale-aware public canonical routes but never private or ambiguous requests',async()=>{
 const {publicRead}=await import('../edge/shared/public-policy.mjs');
 const check=(p,headers={})=>publicRead(new Request('https://example.test'+p,{headers}));
 for(const p of ['/en','/en/article/hello-world','/en/articles?page=2','/api/posts/hello-world?locale=en','/assets/en-a1b2c3.json'])assert.equal(check(p),true,p);
 for(const p of ['/en/admin','/en/account','/api/article-drafts/1','/api/posts?locale=fr','/api/posts?locale=en&locale=zh-CN','/en/article/%2Fsecret','/en/article/%252Fsecret','/assets/private.json'])assert.equal(check(p),false,p);
 for(const header of ['Cookie','Authorization','Proxy-Authorization'])assert.equal(check('/en',{[header]:'private'}),false);
});
test('reader follows only bounded same-origin same-language article canonicalization',async t=>{
 const {createReader}=await import('../edge/reader/server.mjs');const key='test'.repeat(10);let target='/en/article/canonical',calls=[];
 const server=createReader({origin:'https://primary.example.test',key,dist:'.',fetcher:async url=>{
  calls.push(url.href);return url.pathname.endsWith('/1')?new Response(null,{status:301,headers:{Location:target}}):new Response('English content');
 }});server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const request=()=>fetch(`http://127.0.0.1:${server.address().port}/en/article/1`,{headers:{'X-Mooncci-Reader-Key':key}});
 assert.equal(await(await request()).text(),'English content');assert.equal(calls.length,2);
 for(target of ['https://evil.test/en/article/x','/article/chinese','/en/admin','//evil.test/en/article/x']){calls=[];assert.equal((await request()).status,502);assert.equal(calls.length,1);}
});

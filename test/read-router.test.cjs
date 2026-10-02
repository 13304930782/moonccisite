const test=require('node:test'),assert=require('node:assert/strict');
const key='a'.repeat(40);
const env={ROUTING_ENABLED:'true',MODE:'live',READER_ORIGIN:'https://reader.example.test',READER_KEY:key};
function request(path='/',country='US',init={}){const r=new Request('https://mooncci.site'+path,init);Object.defineProperty(r,'cf',{value:{country}});return r;}
test('routing allowlist isolates private requests, unknown regions and write operations',async()=>{
 const {overseas}=await import('../cloudflare/read-router/worker.mjs');
 for(const country of ['CN','XX','T1'])assert.equal(overseas(request('/',country),env),false);
 const missing=new Request('https://mooncci.site/');assert.equal(overseas(missing,env),false);
 for(const path of ['/admin','/account/bookmarks','/api/auth/github/callback','/api/uploads/draft.png','/api/article-drafts/1','/api/posts/1?preview=true','/assets/private.map'])assert.equal(overseas(request(path),env),false,path);
 for(const headers of [{Cookie:'mooncci_token=abc'},{Authorization:'Bearer abc'},{Cookie:'analytics=x'},{Range:'bytes=0-1'}])assert.equal(overseas(request('/','US',{headers}),env),false);
 for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal(overseas(request('/api/posts','US',{method}),env),false);
 for(const path of ['/','/article/1','/api/posts?format=paged&page=1','/assets/index-abcd.js'])assert.equal(overseas(request(path),env),true);
 assert.equal(overseas(request(),{...env,ROUTING_ENABLED:'false'}),false);
 assert.equal(overseas(request(),{...env,MODE:'preview',PREVIEW_KEY:key}),false);
 assert.equal(overseas(request('/','US',{headers:{'X-Mooncci-Preview':key}}),{...env,MODE:'preview',PREVIEW_KEY:key}),true);
});
test('US failures fall back only for eligible reads, writes execute once; upstream cannot be client-selected',async()=>{
 const {handle}=await import('../cloudflare/read-router/worker.mjs');let calls=[];
 const fetcher=async r=>{calls.push(r);return new Response('ok',{status:new URL(r.url).hostname==='reader.example.test'?503:200});};
 await handle(request('/api/posts','US',{headers:{'X-Mooncci-Reader-Key':'evil','X-Mooncci-Public-Host':'evil.test'}}),env,fetcher);
 assert.equal(calls.length,2);assert.equal(new URL(calls[0].url).hostname,'reader.example.test');assert.equal(calls[0].headers.get('X-Mooncci-Reader-Key'),key);assert.equal(calls[1].headers.get('X-Mooncci-Reader-Key'),null);
 calls=[];await handle(request('/api/posts','US',{method:'POST',body:'write'}),env,fetcher);assert.equal(calls.length,1);assert.equal(new URL(calls[0].url).hostname,'mooncci.site');assert.equal(await calls[0].text(),'write');
 calls=[];await handle(request(),{...env,READER_ORIGIN:'https://evil.test/redirect?url=x'},fetcher);assert.equal(calls.length,1);assert.equal(new URL(calls[0].url).hostname,'mooncci.site');
});
test('does not expose reader redirects or Set-Cookie; preserves real article 404',async()=>{
 const {handle}=await import('../cloudflare/read-router/worker.mjs');
 for(const response of [new Response(null,{status:302,headers:{Location:'https://internal.test'}}),new Response('private',{headers:{'Set-Cookie':'secret=x'}})]){
  let n=0;const r=await handle(request(),env,async()=>++n===1?response:new Response('primary'));assert.equal(await r.text(),'primary');assert.equal(n,2);
 }
 let n=0;const r=await handle(request('/article/99'),env,async()=>{n++;return new Response('not found',{status:404});});assert.equal(r.status,404);assert.equal(n,1);
});
test('reader HTTP service refuses authentication, writes and draft uploads; uses fixed anonymous origin',async t=>{
 const {createReader}=await import('../edge/reader/server.mjs');const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mooncci-reader-'));await fs.mkdir(path.join(dir,'assets'));await fs.writeFile(path.join(dir,'assets/index-abcd.js'),'console.log(1)');
 let calls=[];const server=createReader({origin:'https://primary.example.test',key,dist:dir,fetcher:async(url,options)=>{calls.push({url,options});return new Response('public',{headers:{'Cache-Control':'private, no-store'}});}});
 server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});});
 const url='http://127.0.0.1:'+server.address().port;const auth={'X-Mooncci-Reader-Key':key};
 assert.equal((await fetch(url+'/api/posts')).status,403);
 for(const [p,init] of [['/api/posts',{method:'POST'}],['/api/posts',{headers:{Cookie:'x=y'}}],['/api/uploads/draft.png',{}],['/admin',{}]])assert.equal((await fetch(url+p,{...init,headers:{...auth,...init.headers}})).status,403);
 assert.equal(calls.length,0);
 let r=await fetch(url+'/api/posts',{headers:auth});assert.equal(await r.text(),'public');assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(calls[0].url.origin,'https://primary.example.test');assert.equal(calls[0].options.headers.has('X-Mooncci-Reader-Key'),false);
 r=await fetch(url+'/assets/index-abcd.js',{headers:auth});assert.equal(await r.text(),'console.log(1)');assert.match(r.headers.get('cache-control'),/immutable/);
});

test('reader bounds concurrent upstream work and rejects routed origin configuration',async t=>{
 const {createReader}=await import('../edge/reader/server.mjs');
 assert.throws(()=>createReader({origin:'https://mooncci.site',key,dist:'.'}),/direct primary/);
 assert.throws(()=>createReader({origin:'https://origin.example.test',key:'REPLACE_WITH_RANDOM_SECRET_AT_LEAST_32_CHARACTERS',dist:'.'}),/Reader key/);
 let release,started=0;const gate=new Promise(r=>release=r);
 const server=createReader({origin:'https://primary.example.test',key,dist:'.',fetcher:async()=>{started++;await gate;return new Response('ok');}});
 server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{release();await new Promise(r=>server.close(r));});
 const endpoint=`http://127.0.0.1:${server.address().port}/api/posts`;const headers={'X-Mooncci-Reader-Key':key};
 const pending=Array.from({length:8},()=>fetch(endpoint,{headers}));
 for(let n=0;n<100&&started<8;n++)await new Promise(r=>setTimeout(r,10));
 assert.equal(started,8);assert.equal((await fetch(endpoint,{headers})).status,503);
 release();for(const response of await Promise.all(pending))assert.equal(await response.text(),'ok');
 assert.equal((await fetch(endpoint,{headers})).status,200);
});

test('CLI starts through current directory symlink and serves protected health',async t=>{
 const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mooncci-entry-'));
 await fs.symlink(path.resolve(__dirname,'../edge'),path.join(root,'current'),process.platform==='win32'?'junction':'dir');
 const child=spawn(process.execPath,[path.join(root,'current/reader/server.mjs')],{env:{...process.env,PRIMARY_ORIGIN:'https://origin.example.test',READER_KEY:key,READER_DIST:root,READER_PORT:'0'},stdio:['ignore','pipe','pipe']});
 t.after(async()=>{if(child.exitCode===null){const ended=new Promise(r=>child.once('exit',r));child.kill();await ended;}await fs.rm(root,{recursive:true,force:true});});
 const port=await new Promise((resolve,reject)=>{
  let output='';const timer=setTimeout(()=>reject(Error('CLI did not listen')),8000);
  child.once('exit',code=>{clearTimeout(timer);reject(Error('CLI exited before listening: '+code));});
  child.once('error',error=>{clearTimeout(timer);reject(error);});
  child.stdout.on('data',data=>{output+=data;const m=output.match(/loopback:(\d+)/);if(m){clearTimeout(timer);resolve(Number(m[1]));}});
 });
 const r=await fetch(`http://127.0.0.1:${port}/_reader/health`,{headers:{'X-Mooncci-Reader-Key':key}});
 assert.equal(r.status,200);assert.equal(await r.text(),'ok');
});

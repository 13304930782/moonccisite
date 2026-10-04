const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {createDiagnostics,safePath}=require('../src/lib/siteDiagnostics');
test('diagnostic middleware is opt-in, scoped, private, correlated and does not log secrets',async t=>{
 const logs=[],app=express();app.use(createDiagnostics({emit:line=>logs.push(JSON.parse(line))}));
 app.get('*',(req,res)=>res.json({body:'SECRET_BODY'}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());
 const url='http://127.0.0.1:'+server.address().port;
 const plain=await fetch(url+'/api/posts');assert.equal(plain.headers.get('x-diagnostic-request-id'),null);await plain.text();assert.equal(logs.length,0);
 const response=await fetch(url+'/api/posts/31?password=SECRET_QUERY',{headers:{'X-Mooncci-Diagnostic':'1',Cookie:'SECRET_COOKIE',Authorization:'SECRET_AUTH','X-Diagnostic-Request-ID':'attacker-selected'}});
 assert.match(response.headers.get('x-diagnostic-request-id'),/^[a-f0-9-]{36}$/);assert.match(response.headers.get('server-timing'),/^app;dur=/);assert.equal(response.headers.get('cache-control'),'private, no-store');await response.text();
 assert.equal(logs[0].path,'/api/posts/:id');assert.equal(logs[0].request_id,response.headers.get('x-diagnostic-request-id'));assert(!JSON.stringify(logs).includes('SECRET'));
 await (await fetch(url+'/api/mailboxes/credentials/reveal',{headers:{'X-Mooncci-Diagnostic':'1'}})).text();assert.equal(logs.length,1);
});
test('safe paths and disabled switch do not capture private operations',()=>{assert.equal(safePath('/api/mailboxes/folders/sent/20'),'/api/mailboxes/folders/sent/:uid');assert.equal(safePath('/api/auth/login'),null);let passed=false;createDiagnostics({env:{SITE_DIAGNOSTICS_ENABLED:'false'}})({path:'/api/posts',get:()=> '1'},null,()=>passed=true);assert(passed);});
test('request logs are bounded and logger failure cannot break the response',async t=>{
 let calls=0;const app=express();app.use(createDiagnostics({emit:()=>{calls++;throw Error('sink unavailable');},wall:()=>100000}));app.get('/api/posts',(_req,res)=>res.json({ok:true}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());
 for(let i=0;i<65;i++){const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/posts',{headers:{'X-Mooncci-Diagnostic':'1'}});assert.equal((await r.json()).ok,true);}assert.equal(calls,60);
});

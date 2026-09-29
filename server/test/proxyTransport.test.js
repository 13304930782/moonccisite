const test=require('node:test'),assert=require('node:assert/strict'),https=require('node:https');
const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const transport=require('../src/lib/proxyTransport');
function fixture(t,replies){
 const old=process.env.GITHUB_OAUTH_PROXY_URL;process.env.GITHUB_OAUTH_PROXY_URL='https://proxy.example';t.after(()=>{if(old===undefined)delete process.env.GITHUB_OAUTH_PROXY_URL;else process.env.GITHUB_OAUTH_PROXY_URL=old;});
 const calls=[];
 t.mock.method(https,'request',(url,options,callback)=>{
  const req=new EventEmitter();req.destroy=()=>{};
  req.end=body=>{calls.push({url,options,body});queueMicrotask(()=>{
   const value=replies.shift();if(value.error){req.emit('error',value.error);return;}
   const res=new PassThrough();res.statusCode=value.status||200;res.headers=value.headers||{};res.complete=true;callback(res);res.end(value.body||'{}');
  });};return req;
 });return calls;
}
test('IPv4 policy applies only to configured certificate and proxy routes',()=>{
 const env={GITHUB_OAUTH_PROXY_URL:'https://proxy.example'};
 for(const path of ['/token','/user','/emails'])assert.equal(transport.ipv4Options('https://proxy.example'+path,env).family,4);
 assert.equal(transport.ipv4Options('https://google-certs.mooncci.site/google-certs',env).family,4);
 for(const url of ['https://proxy.example/other','https://proxy.example/user?x=1','https://api.github.com/user','https://login.microsoftonline.com/','https://evil.example/user','http://proxy.example/user'])assert.deepEqual(transport.ipv4Options(url,env),{});
});
test('IPv4 requests preserve body/auth/signal and default TLS verification',async t=>{
 const calls=fixture(t,[{status:401,headers:{'x-mooncci-proxy-diagnostic':'upstream_http_401','x-mooncci-proxy-version':'3'}}]);const signal=AbortSignal.timeout(10000);
 const response=await transport.fetch('https://proxy.example/token',{method:'POST',body:'code=fixture',signal,headers:{Authorization:'Bearer fixture','X-Mooncci-Proxy-Key':'fixture'}});
 assert.equal(response.status,401);assert.equal(response.headers.get('x-mooncci-proxy-diagnostic'),'upstream_http_401');
 assert.equal(calls[0].options.family,4);assert.equal(calls[0].options.autoSelectFamily,false);assert.equal(calls[0].options.signal,signal);assert.notEqual(calls[0].options.rejectUnauthorized,false);assert.equal(calls[0].body,'code=fixture');assert.equal(calls[0].options.headers.authorization,'Bearer fixture');
});
test('redirects, oversized bodies and network failures fail without retries',async t=>{
 const calls=fixture(t,[{status:302,headers:{location:'https://evil.example'}},{body:'x'.repeat(262145)},{error:Object.assign(Error('timeout'),{code:'ETIMEDOUT'})}]);
 await assert.rejects(transport.fetch('https://proxy.example/user'),/redirect/);
 await assert.rejects(transport.fetch('https://proxy.example/user'),/limit/);
 await assert.rejects(transport.fetch('https://proxy.example/token',{method:'POST',body:'code=once'}),{code:'ETIMEDOUT'});assert.equal(calls.length,3);
});
test('actual GitHub exchange routes all three operations through IPv4',async t=>{
 const calls=fixture(t,[{body:'{"access_token":"fixture"}'},{body:'{"id":42,"login":"reader"}'},{body:'[{"email":"reader@example.test","verified":true,"primary":true}]'}]);
 const old=process.env.GITHUB_OAUTH_PROXY_KEY;process.env.GITHUB_OAUTH_PROXY_KEY='a'.repeat(64);t.after(()=>{if(old===undefined)delete process.env.GITHUB_OAUTH_PROXY_KEY;else process.env.GITHUB_OAUTH_PROXY_KEY=old;});
 const user=await require('../src/lib/socialProviders').exchange('github',{client_id:'fixture'},'secret','code','verifier');assert.equal(user.subject,'42');assert.equal(calls.length,3);assert(calls.every(c=>c.options.family===4));
});
test('health probes use the same IPv4 transport and preserve success criteria',async t=>{
 const calls=fixture(t,[{status:401,headers:{'x-mooncci-proxy-diagnostic':'upstream_http_401','x-mooncci-proxy-version':'3'}}]);
 const result=await require('../src/lib/dependencyHealth').createDependencyHealth({env:{GITHUB_OAUTH_PROXY_URL:'https://proxy.example',GITHUB_OAUTH_PROXY_KEY:'a'.repeat(64)}})('github');assert.equal(result.ok,true);assert.equal(calls[0].options.family,4);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {X509Certificate} from 'node:crypto';
import {once} from 'node:events';
import {createGoogleCache} from '../google-cache.mjs';
import {createServer} from '../server.mjs';
import github from '../github-worker.mjs';
const cert=readFileSync(new URL('./certificate.pem',import.meta.url),'utf8');
const start=Date.parse(new X509Certificate(cert).validFrom)+1000;
const key='a'.repeat(64);
test('Google coalesces refresh, honors Age, and never serves expired keys on failure', async()=>{
 let time=start,calls=0,fail=false;
 const get=createGoogleCache({now:()=>time,fetcher:async()=>{
  calls++; if(fail)throw Error('offline');
  await new Promise(r=>setTimeout(r,10));
  return new Response(JSON.stringify({kid:cert}),{headers:{'Cache-Control':'public,max-age=60','Age':'50'}});
 }});
 const results=await Promise.all(Array.from({length:10},()=>get()));
 assert.equal(calls,1);
 assert.equal(results[0].headers.get('cache-control'),'public, max-age=10');
 time+=9000;await get();assert.equal(calls,1);
 time+=2000;fail=true;await assert.rejects(get(),/offline/);assert.equal(calls,2);
 fail=false;await get();assert.equal(calls,3);
});
test('Google refuses malformed certificate data and does not cache no-store',async()=>{
 const bad=createGoogleCache({now:()=>start,fetcher:async()=>new Response('{"kid":"bad"}')});
 await assert.rejects(bad());
 let calls=0;
 const get=createGoogleCache({now:()=>start,fetcher:async()=>{
  calls++;return new Response(JSON.stringify({kid:cert}),{headers:{'Cache-Control':'no-store,max-age=3600'}});
 }});
 await get();await get();assert.equal(calls,2);
});
test('GitHub fixed routes, credential isolation, 401 health protocol and no retry',async()=>{
 const original=globalThis.fetch;const calls=[];
 globalThis.fetch=async(url,options)=>{
  calls.push({url,options});
  return new Response('{"message":"bad credentials"}',{status:401});
 };
 try {
  const request=(path,extra={})=>new Request('https://relay.example'+path,{
   headers:{'X-Mooncci-Proxy-Key':key,Authorization:'Bearer invalid','Cookie':'private'},...extra
  });
  for(const path of ['/https://attacker.example','/user?url=https://attacker.example']){
   assert.equal((await github.fetch(request(path),{GITHUB_OAUTH_PROXY_KEY:key})).status,404);
  }
  assert.equal(calls.length,0);
  const result=await github.fetch(request('/user'),{GITHUB_OAUTH_PROXY_KEY:key});
  assert.equal(result.status,401);
  assert.equal(result.headers.get('X-Mooncci-Proxy-Diagnostic'),'upstream_http_401');
  assert.match(result.headers.get('cache-control'),/no-store/);
  assert.equal(calls[0].url,'https://api.github.com/user');
  assert.equal(calls[0].options.headers.Cookie,undefined);
  assert.equal(calls[0].options.headers['X-Mooncci-Proxy-Key'],undefined);
  globalThis.fetch=async()=>{calls.push({});throw new Error('secret-value')};
  const failure=await github.fetch(request('/user'),{GITHUB_OAUTH_PROXY_KEY:key});
  assert.equal(failure.status,502);assert.equal(calls.length,2);
  assert.doesNotMatch(await failure.text(),/secret-value/);
 } finally {globalThis.fetch=original;}
});
test('HTTP adapter denies bad keys before upstream and serves public certificates',async()=>{
 let calls=0;
 const server=createServer({env:{GITHUB_OAUTH_PROXY_KEY:key},google:async()=>{
  calls++;return new Response('{"keys":"public"}');
 }});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;
 try {
  assert.equal((await fetch(base+'/user',{headers:{'X-Mooncci-Proxy-Key':'b'.repeat(64)}})).status,403);
  assert.equal(calls,0);
  assert.equal((await fetch(base+'/google-certs')).status,200);assert.equal(calls,1);
 } finally {server.closeAllConnections();await new Promise(r=>server.close(r));}
});

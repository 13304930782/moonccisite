// Read-only network checks. No .env, credentials, OAuth exchange or PM2 changes.
const https=require('node:https'),dns=require('node:dns').promises,net=require('node:net');
const {spawn}=require('node:child_process');
const targets=['https://google-certs.mooncci.site/google-certs','https://github-auth.mooncci.site/user'];
const errors=e=>({code:e?.code||e?.name||'unknown',syscall:e?.syscall||null,address:e?.address||null,attempts:e?.errors?.map(errors)});
if(process.argv[2]==='fetch'){
 const ms=Number(process.argv[3]);if(ms)net.setDefaultAutoSelectFamilyAttemptTimeout(ms);
 const url=process.argv[4],start=Date.now();
 fetch(url,{redirect:'error',signal:AbortSignal.timeout(8000)}).then(async r=>{console.log(JSON.stringify({mode:ms?'fetch-attempt-2000':'fetch-default',host:new URL(url).hostname,status:r.status,ms:Date.now()-start}));await r.body?.cancel();}).catch(e=>console.log(JSON.stringify({mode:ms?'fetch-attempt-2000':'fetch-default',host:new URL(url).hostname,ms:Date.now()-start,error:errors(e.cause||e)})));
}else{
 (async()=>{
 console.log(JSON.stringify({node:process.version,autoSelectFamily:net.getDefaultAutoSelectFamily(),attemptMs:net.getDefaultAutoSelectFamilyAttemptTimeout(),time:new Date().toISOString()}));
 for(const url of targets){
  const host=new URL(url).hostname;console.log(JSON.stringify({host,dns:await dns.lookup(host,{all:true}).catch(errors)}));
  for(let round=1;round<=2;round++){
   console.log(JSON.stringify({host,round}));
   await Promise.all([4,6].map(family=>new Promise(resolve=>{
    const start=Date.now();const req=https.get(url,{family,agent:false,signal:AbortSignal.timeout(8000)},r=>{console.log(JSON.stringify({mode:'https',host,family,status:r.statusCode,ms:Date.now()-start,remote:r.socket.remoteAddress}));r.resume();resolve();});
    req.on('error',e=>{console.log(JSON.stringify({mode:'https',host,family,ms:Date.now()-start,error:errors(e)}));resolve();});
   })));
   for(const ms of [0,2000])await new Promise(resolve=>{const child=spawn(process.execPath,[__filename,'fetch',String(ms),url],{stdio:'inherit'});child.once('error',e=>{console.log(errors(e));resolve();});child.once('exit',resolve);});
  }
 }
 console.log('Done. GitHub HTTP 403 is expected without the proxy key; this tests the server-to-proxy connection only.');
 })().catch(e=>{console.log(errors(e));process.exitCode=1;});
}

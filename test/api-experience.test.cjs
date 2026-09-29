const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript'), fs = require('fs');
const code = ts.transpileModule(fs.readFileSync('src/app/lib/api.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleApi = {exports:{}}; new Function('exports','module',code)(moduleApi.exports,moduleApi);
const {api} = moduleApi.exports;
test('request timeout, cancellation, response classification, credentials and no write retry', async () => {
 const original = global.fetch;
 try {
  let calls=0;
  global.fetch=async (_url,options)=>{calls++;assert.equal(options.credentials,'same-origin');assert.equal(options.headers.has('Authorization'),false);return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json'}});};
  assert.deepEqual(await api('/test',{headers:{Authorization:'must-not-leak'}}),{ok:true});
  global.fetch=(_url,{signal})=>new Promise((resolve,reject)=>{calls++;signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});});
  await assert.rejects(api('/slow',{timeoutMs:5}),e=>e.kind==='timeout'&&!e.uncertain);
  const before=calls;
  await assert.rejects(api('/write',{method:'POST',timeoutMs:5}),e=>e.uncertain&&e.kind==='timeout');assert.equal(calls,before+1);
  const c=new AbortController();c.abort();await assert.rejects(api('/cancel',{signal:c.signal}),e=>e.kind==='cancelled');
  global.fetch=async()=>new Response('<html>nginx</html>',{status:504});
  await assert.rejects(api('/read'),e=>e.status===504&&!e.message.includes('Nginx'));
  await assert.rejects(api('/write',{method:'PUT'}),e=>e.uncertain);
  global.fetch=async()=>new Response('{broken',{headers:{'Content-Type':'application/json'}});
  await assert.rejects(api('/read'),e=>e.kind==='format');
  global.fetch=async()=>new Response(JSON.stringify({message:'邮箱格式错误'}),{status:400,headers:{'Content-Type':'application/json'}});
  await assert.rejects(api('/write',{method:'POST'}),e=>e.message==='邮箱格式错误'&&!e.uncertain);
 } finally {global.fetch=original;}
});

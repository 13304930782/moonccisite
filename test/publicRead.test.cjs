const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('src/app/lib/publicRead.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function load(){const calls=[];const module={exports:{}};const api=(path,opts)=>new Promise((resolve,reject)=>{calls.push({path,opts,resolve,reject});opts.signal.addEventListener('abort',()=>reject(Error('aborted')));});new Function('exports','module','require',code)(module.exports,module,()=>({api,ApiError:Error,snapshotGeneration:()=>0}));return {read:module.exports.publicRead,calls};}
test('published reads deduplicate, individual cancellation does not cancel another consumer',async()=>{
 const {read,calls}=load(),a=new AbortController(),b=new AbortController();
 const one=read('/activity?pageSize=6',a.signal),two=read('/activity?pageSize=6',b.signal);
 assert.equal(calls.length,1);a.abort();await assert.rejects(one);assert.equal(calls[0].opts.signal.aborted,false);
 calls[0].resolve({items:['same']});assert.deepEqual(await two,{items:['same']});
 const fresh=read('/activity?pageSize=6',b.signal);assert.equal(calls.length,2);calls[1].resolve('new');assert.equal(await fresh,'new');
});
test('last consumer aborts underlying request, rejected flight is never reused',async()=>{
 const {read,calls}=load(),a=new AbortController();const one=read('/now',a.signal);a.abort();await assert.rejects(one);await Promise.resolve();assert(calls[0].opts.signal.aborted);
 const two=read('/now',new AbortController().signal);assert.equal(calls.length,2);calls[1].reject(Error('offline'));await assert.rejects(two,/offline/);
 const three=read('/now',new AbortController().signal);assert.equal(calls.length,3);calls[2].resolve('ok');await three;
});
test('account and mailbox reads never share work; query variants remain independent',async()=>{
 const {read,calls}=load(),signal=new AbortController().signal;
 const promises=['/mailboxes/me','/mailboxes/me','/admin/projects','/admin/projects','/activity?page=1','/activity?page=2'].map(p=>read(p,signal));
 assert.equal(calls.length,6);calls.forEach(c=>c.resolve('ok'));await Promise.all(promises);
});

test('public lists share identical queries but authorized article details never share',async()=>{
 const {read,calls}=load(),signal=new AbortController().signal;
 const paths=['/posts?page=2&tag=a','/posts?page=2&tag=a','/posts?page=2&tag=b','/posts/meta/tags','/posts/meta/tags','/posts/12','/posts/12'];
 const tasks=paths.map(path=>read(path,signal));assert.equal(calls.length,5);calls.forEach(c=>c.resolve('ok'));await Promise.all(tasks);
});

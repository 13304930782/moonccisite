const {test}=require('node:test');
const assert=require('node:assert/strict');
const {waitForDocument}=require('./accept.cjs');
const document=(src,bootstrap=true)=>Object.assign(Buffer.from(`<script src="${src}"></script>${bootstrap?'<script id="mooncci-document-data"></script>':''}`),{responseHeaders:{age:'14','cache-control':'public, s-maxage=15','x-home-cache':'HIT','set-cookie':'must-not-log'}});
test('cached homepage must eventually return the exact new entry and SSR data',async()=>{
 let calls=0,elapsed=0;const logs=[];
 const html=await waitForDocument('/',['/assets/new.js'],async()=>document(++calls<5?'/assets/old.js':'/assets/new.js'),async ms=>{elapsed+=ms;},message=>logs.push(message));
 assert.equal(calls,5);assert.equal(elapsed,16000);assert.match(html,/new.js/);
 assert.equal(logs.length,4);assert.match(logs[0],/old.js/);assert.match(logs[0],/s-maxage=15/);assert.ok(!logs[0].includes('must-not-log'));
});
test('persistent stale homepage fails after 20 seconds; a header spoof cannot substitute for a script',async()=>{
 let calls=0,elapsed=0;
 await assert.rejects(waitForDocument('/',['/assets/new.js'],async()=>{calls++;return document('/assets/old.js');},async ms=>{elapsed+=ms;},()=>{}),/after bounded checks.*old.js/);
 assert.equal(calls,6);assert.equal(elapsed,20000);
 await assert.rejects(waitForDocument('/articles',['/assets/new.js'],async()=>Buffer.from('<div>/assets/new.js mooncci-document-data</div>'),async()=>assert.fail('No list retry'),()=>{}),/actual":\[\]/);
});
test('new script with missing SSR data still fails',async()=>{
 await assert.rejects(waitForDocument('/article/17',['/assets/new.js'],async()=>document('/assets/new.js',false),async()=>assert.fail('No detail retry'),()=>{}),/bootstrap":false/);
});

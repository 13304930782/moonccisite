const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {analyzeHtml,fetchDocument,checkPost,postReports,indexNowStatus,queueIndexNow}=require('../src/lib/publicationHealth');
const good='<title>Article</title><link rel="canonical" href="https://moooncci.cn/article/example"><h1>Article</h1><img alt="" role="presentation">';
test('published document checks canonical, noindex, headings and meaningful image alternatives',()=>{
 assert.deepEqual(analyzeHtml(good,'https://moooncci.cn/article/example',200,{'content-type':'text/html'}).issues,[]);
 const result=analyzeHtml(good+'<h1>Second</h1><img><img alt="">','https://moooncci.cn/article/other',404,{'content-type':'text/html','x-robots-tag':'noindex'});
 assert.deepEqual(result.issues.map(i=>i.code),['http','canonical','noindex','h1','alt-missing','alt-review']);
 assert.equal(analyzeHtml('<title>x</title><meta name="bingbot" content="none">','https://moooncci.cn/',200).issues.some(i=>i.code==='noindex'),true);
});
test('reports track version and failure; IndexNow bridge is bounded, deduplicated and no secrets exposed',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mooncci-health-'));
 const old={SITE_URL:process.env.SITE_URL,MOONCCI_PUBLICATION_CHECK_DIR:process.env.MOONCCI_PUBLICATION_CHECK_DIR,MOONCCI_INDEXNOW_ADMIN_DIR:process.env.MOONCCI_INDEXNOW_ADMIN_DIR};
 Object.assign(process.env,{SITE_URL:'https://moooncci.cn',MOONCCI_PUBLICATION_CHECK_DIR:dir,MOONCCI_INDEXNOW_ADMIN_DIR:path.join(dir,'bridge')});
 t.after(async()=>{for(const [key,value]of Object.entries(old))value===undefined?delete process.env[key]:process.env[key]=value;await fs.rm(dir,{recursive:true,force:true});});
 const post={id:1,slug:'example',version:1,status:'published'};
 const report=await checkPost(post,7,async()=>new Response(good,{headers:{'content-type':'text/html'}}));
 assert.equal(report.state,'passed');assert.equal(report.actorId,7);
 assert.equal((await postReports([{...post,version:2}]))[0].stale,true);
 const failed=await checkPost(post,7,async()=>{throw Error('secret socket details');});
 assert.equal(failed.state,'failed');assert(!JSON.stringify(failed).includes('secret'));
 await assert.rejects(()=>checkPost({...post,status:'draft'},7),{status:409});
 assert.equal((await indexNowStatus()).state,'unavailable');
 const bridge=process.env.MOONCCI_INDEXNOW_ADMIN_DIR;await fs.mkdir(path.join(bridge,'requests'),{recursive:true});
 const status={version:1,origin:'https://moooncci.cn',checkedAt:new Date().toISOString(),pendingCount:0,receipts:[],requests:[],key:'SECRET'};
 await fs.writeFile(path.join(bridge,'status.json'),JSON.stringify(status));
 assert(!JSON.stringify(await indexNowStatus()).includes('SECRET'));
 assert.equal((await queueIndexNow(post,7)).request.url,'https://moooncci.cn/article/example');
 await assert.rejects(()=>queueIndexNow(post,7),{status:409});
 await assert.rejects(()=>queueIndexNow({...post,status:'draft'},7),{status:400});
 await fs.writeFile(path.join(bridge,'status.json'),JSON.stringify({...status,checkedAt:new Date(Date.now()-1000000).toISOString()}));
 assert.equal((await indexNowStatus()).state,'stale');
 await assert.rejects(()=>queueIndexNow(post,7),{status:503});
 await fs.writeFile(path.join(bridge,'status.json'),'broken');assert.equal((await indexNowStatus()).state,'invalid');
});

test('document fetch is bounded and never follows redirects',async()=>{
 let options;
 const response=await fetchDocument('https://moooncci.cn/article/example',async(_url,value)=>{options=value;return new Response('',{status:301,headers:{location:'http://127.0.0.1/private'}});});
 assert.equal(options.redirect,'manual');assert.equal(response.status,301);
 await assert.rejects(()=>fetchDocument('https://moooncci.cn/',async()=>new Response('x'.repeat(2097153))),/2 MiB/);
});

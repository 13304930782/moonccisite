const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const documents=require('../src/lib/publicDocument');

test('SSR resource fan-out does not spend the visitor API budget; direct API and document limits remain enforced',async t=>{
 const app=express();app.set('trust proxy','loopback');
 const rateLimit=require('express-rate-limit');
 app.use('/api',rateLimit({windowMs:60000,limit:200,skip:documents.isDocumentResourceRequest}));
 app.get('/api/settings/site',(_req,res)=>res.json({brand:{site_title:'fixture'}}));
 app.get('/page',rateLimit({windowMs:60000,limit:60}),async(req,res)=>{
  try{await Promise.all(Array.from({length:5},()=>documents.loadPublicResource('/settings/site',req.ip)));res.send('document');}
  catch{res.sendStatus(503);}
 });
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const oldPort=process.env.PORT;process.env.PORT=String(server.address().port);
 t.after(async()=>{if(oldPort===undefined)delete process.env.PORT;else process.env.PORT=oldPort;await new Promise(r=>server.close(r));});
 const base='http://127.0.0.1:'+server.address().port;
 for(let i=0;i<60;i++)assert.equal((await fetch(base+'/page')).status,200,`page ${i+1}`);
 assert.equal((await fetch(base+'/page')).status,429,'The outer document limit still applies');
 for(let i=0;i<200;i++)assert.equal((await fetch(base+'/api/settings/site',{headers:{'X-Mooncci-Document':'forged'}})).status,200);
 assert.equal((await fetch(base+'/api/settings/site',{headers:{'X-Mooncci-Document':'forged'}})).status,429,'A public header cannot bypass the API limit');
});

test('document budget exemption requires the private process token, loopback peer and public GET resource',async t=>{
 const original=global.fetch;let token;
 global.fetch=async(url,options)=>{assert.match(url,/^http:\/\/127\.0\.0\.1:\d+\/api\/settings\/site$/);token=options.headers['X-Mooncci-Document'];assert.equal(options.headers.Cookie,undefined);assert.equal(options.headers.Authorization,undefined);return new Response('{}');};
 t.after(()=>{global.fetch=original;});
 await documents.loadPublicResource('/settings/site','192.0.2.2');
 const request={method:'GET',originalUrl:'/api/settings/site',socket:{remoteAddress:'127.0.0.1'},headers:{'x-mooncci-document':token}};
 assert.equal(documents.isDocumentResourceRequest(request),true);
 for(const change of [
  {method:'POST'}, {originalUrl:'/api/admin/posts'}, {originalUrl:'/api/posts?status=draft'},
  {socket:{remoteAddress:'192.0.2.2'}}, {headers:{}},
  {headers:{'x-mooncci-document':'0'.repeat(64)}},
  {headers:{'x-mooncci-document':[token]}},
 ])assert.equal(documents.isDocumentResourceRequest({...request,...change}),false);
 await assert.rejects(documents.loadPublicResource('/auth/session'),/Unexpected/);
 const fs=require('node:fs');assert.match(fs.readFileSync(require.resolve('../src/index.js'),'utf8'),/skip: \(req\) => require\('\.\/lib\/publicDocument'\)\.isDocumentResourceRequest\(req\)/,'Production limiter uses the checked gate');
});

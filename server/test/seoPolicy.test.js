const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {createSeoRouter}=require('../src/routes/seo');
test('indexing policy validates tag, pagination and unknown URLs without publishing private content',async t=>{
 const db={query:async(sql)=>{
  if(sql.includes('site_settings'))return [[{setting_value:'{"site_title":"mooncci"}'}]];
  if(sql.includes('SELECT tags'))return [[{tags:'["React"]'}]];
  return [[]];
 }};
 const app=express();app.use(createSeoRouter({db,loadResource:async()=>({total:25,pageSize:12}),readTemplate:async()=>'<html><head></head><body><div id="root"></div><script></script></body></html>',renderDocument:async(url,load,status)=>({html:'<main>content</main>',data:{resources:{},errors:{},status,url}}),injectDocument:async html=>html}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;
 for(const [pathname,status] of [['/tag/React',200],['/tag/missing',404],['/articles&page=2',200],['/articles&page=4',404],['/articles&page=0',404],['/unknown-path',404]]){
  const r=await fetch(base+'/api/seo?path='+pathname);assert.equal(r.status,status,pathname);const meta=await r.json();
  if(status===404)assert.match(meta.robots,/noindex/);else assert.match(meta.robots,/^index/);
  if(pathname.includes('page=2'))assert.equal(meta.canonical,'https://mooncci.site/articles?page=2');
 }
 for(const pathname of ['/search','/diagnostics','/login','/account/settings','/admin/write']){
  const r=await fetch(base+pathname);assert.equal(r.status,200);assert.match(r.headers.get('x-robots-tag'),/noindex/);
 }
 for(const pathname of ['/early-access','/mail-setup']){
  const r=await fetch(base+'/api/seo?path='+pathname);assert.equal(r.status,200);assert.match((await r.json()).robots,/^index/);
 }
});

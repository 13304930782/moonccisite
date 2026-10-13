const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const seo=require('../src/lib/seo'),{createSeoRouter}=require('../src/routes/seo');
test('public landing pages have distinct informative metadata and canonical .site URLs',()=>{
 const metas=Object.keys(seo.titles).map(path=>seo.baseMeta(path));
 assert.equal(new Set(metas.map(m=>m.title)).size,metas.length);
 assert.equal(new Set(metas.map(m=>m.description)).size,metas.length);
 for(const m of metas){assert.ok(m.description.length>=60);assert.ok(m.description.length<=160);assert.equal(new URL(m.canonical).origin,'https://mooncci.site');}
});
test('short summaries use real body text without duplicating leading text',()=>{
 const body='这是正文中详细的部署步骤。'.repeat(15);
 assert.equal(seo.contentDescription('简短摘要',body),('简短摘要 '+body).slice(0,160));
 assert.equal(seo.contentDescription('这是正文',body),body.slice(0,160));
 assert.equal(seo.contentDescription('',body),body.slice(0,160));
 assert.equal(seo.contentDescription('真实短内容',''),'真实短内容');
 const summary='完整且真实的文章摘要。'.repeat(12);
 assert.equal(seo.contentDescription(summary,body),summary.slice(0,160));
 const m=seo.articleMeta({id:1,title:'部署实践',summary:'简短摘要',content:body});
 assert.equal(m.description,m.jsonLd.description);
 assert.equal(seo.projectMeta({slug:'demo',name:'Demo',summary:'简短摘要',content:body}).description,m.description);
});
test('activity filters and pagination have distinct metadata; public images remain crawlable',async t=>{
 const app=express();app.use(createSeoRouter({db:{query:async()=>[[{setting_value:'{"site_title":"mooncci"}'}]]},loadResource:async()=>({total:36,pageSize:12})}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}`;
 const get=async query=>{const r=await fetch(base+'/api/seo?'+query);assert.equal(r.status,200);return r.json();};
 const all=await get('path=/updates'),post=await get('path=/updates&type=post'),update=await get('path=/updates&type=update'),release=await get('path=/updates&type=release');
 assert.equal(new Set([all,post,update,release].map(m=>m.title)).size,4);
 assert.equal(new Set([all,post,update,release].map(m=>m.description)).size,4);
 const page=await get('path=/updates&type=post&page=2');assert.equal(page.canonical,'https://mooncci.site/updates?page=2&type=post');assert.notEqual(page.description,post.description);
 assert.equal((await fetch(base+'/api/seo?path=/updates&type=bad')).status,404);
 const robots=await(await fetch(base+'/robots.txt')).text();assert.match(robots,/Disallow: \/api\/\n/);assert.match(robots,/Allow: \/api\/uploads\/\n/);assert.match(robots,/Allow: \/api\/image-variants\/\n/);
});

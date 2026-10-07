const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');const seo=require('../src/lib/seo'),{createSeoRouter:makeSeoRouter}=require('../src/routes/seo');
const createSeoRouter=options=>makeSeoRouter({renderDocument:async()=>({html:'<main>公开内容</main>',data:{resources:{},errors:{}}}),injectDocument:async(html)=>html,...options});
const template='<!doctype html><html><head><title>Default</title><meta name="description" content="old"><meta property="og:site_name" content="old"></head><body><div id="root"></div><script src="/assets/app.js"></script></body></html>';
const post={id:7,title:'C <script>alert(1)</script> & 数组',summary:'A "summary"',content:'body',published_at:'2024-11-13T10:00:00Z',updated_at:'2026-09-18T10:00:00Z',author_name:'</script><script>bad()</script>'};
test('server rendered metadata escapes HTML and JSON while preserving original dates',()=>{const m=seo.articleMeta(post);const html=seo.renderHtml(template,m);assert.equal((html.match(/<title>/g)||[]).length,1);assert.equal((html.match(/name="description"/g)||[]).length,1);assert.ok(!html.includes('<script>bad()'));assert.ok(!html.includes('<script>alert(1)'));const json=JSON.parse(html.match(/type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);assert.equal(json.headline,post.title);assert.equal(json.datePublished,post.published_at.replace('Z','.000Z'));assert.equal(json.dateModified,post.updated_at.replace('Z','.000Z'));assert.match(m.image,/default-share.png$/);assert.equal(seo.articleMeta({...post,cover_image:'javascript:alert(1)'}).image,m.image);});
test('HTTP without JavaScript returns metadata, private/missing posts 404 and public-only sitemap',async t=>{const db={query:async(sql,args)=>{if(sql.includes('site_settings'))return [[{setting_value:'{"site_title":"mooncci"}'}]];assert.match(sql,/status='published'/);if(sql.includes('JOIN users'))return [args[0]==='7'?[post]:[]];if(sql.includes('SELECT DISTINCT category'))return [[{category:'都市天际线2'}]];if(sql.includes('FROM posts'))return [[post]];if(sql.includes('FROM updates'))return [[{id:2,updated_at:post.updated_at}]];return [[{slug:'project-a',updated_at:post.updated_at}]];}};const app=express();app.use(createSeoRouter({db,readTemplate:async()=>template}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));const base=`http://127.0.0.1:${server.address().port}`;
 let r=await fetch(base+'/article/7');assert.equal(r.status,200);const html=await r.text();assert.match(html,/property="og:title"/);assert.match(html,/article:modified_time/);assert.match(html,/rel="canonical"/);
 for(const id of ['8','999','invalid']){r=await fetch(base+'/article/'+id);assert.equal(r.status,404);const body=await r.text();assert.ok(!body.includes('A &quot;summary&quot;'));assert.ok(!body.includes('BlogPosting'));assert.match(r.headers.get('x-robots-tag'),/noindex/);}
 r=await fetch(base+'/api/seo?path=/account/settings');const meta=await r.json();assert.match(meta.robots,/noindex/);assert.equal(meta.jsonLd,null);
 const xml=await(await fetch(base+'/sitemap.xml')).text();assert.match(xml,/article\/7/);assert.match(xml,/updates\/2/);assert.match(xml,/projects\/project-a/);assert.ok(!xml.includes('/admin'));assert.match(xml,/lastmod/);
 assert.match(xml,/category\/%E9%83%BD%E5%B8%82%E5%A4%A9%E9%99%85%E7%BA%BF2/);
 assert.match(await(await fetch(base+'/robots.txt')).text(),/Sitemap: https?:/);
});
test('missing built HTML fails closed',async t=>{const app=express();app.use(createSeoRouter({db:{query:async()=>[[]]},readTemplate:async()=>{throw Error('missing')}}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));const r=await fetch(`http://127.0.0.1:${server.address().port}/articles`);assert.equal(r.status,503);assert.match(r.headers.get('x-robots-tag'),/noindex/);});

test('public project and update have unique initial HTML; unpublished details are not indexed',async t=>{
 const db={query:async(sql,args)=>{
  if(sql.includes('site_settings'))return [[{setting_value:'{"site_title":"mooncci"}'}]];
  if(sql.includes('FROM projects'))return [args[0]==='promptdock'?[{slug:'promptdock',name:'PromptDock',summary:'管理提示词与版本',cover_image:'/api/uploads/promptdock.webp'}]:[]];
  if(sql.includes('FROM updates'))return [args[0]==='2'?[{id:2,content:'今天发布了新版本',image_url:''}]:[]];
  if(sql.includes('FROM posts'))return [args[0]==='都市天际线2'?[{category:'都市天际线2'}]:[]];
  throw Error('Unexpected query');
 }};
 const app=express();app.use(createSeoRouter({db,readTemplate:async()=>template}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));const base=`http://127.0.0.1:${server.address().port}`;
 for(const [path,title] of [['/projects/promptdock','PromptDock'],['/updates/2','今天发布了新版本'],['/category/%E9%83%BD%E5%B8%82%E5%A4%A9%E9%99%85%E7%BA%BF2','都市天际线2'],['/projects','作品']]){
  const r=await fetch(base+path);assert.equal(r.status,200);const html=await r.text();assert.match(html,new RegExp(`<title>${title}`));assert.match(html,new RegExp(`rel="canonical" href="https://mooncci.site${path}"`));assert.equal((html.match(/<title>/g)||[]).length,1);
 }
 for(const path of ['/projects/draft','/updates/3','/category/missing']){const r=await fetch(base+path);assert.equal(r.status,404);assert.match(r.headers.get('x-robots-tag'),/noindex/);assert.doesNotMatch(await r.text(),/管理提示词与版本|今天发布了新版本/);}
});

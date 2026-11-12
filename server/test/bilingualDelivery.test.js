const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const seo=require('../src/lib/seo');
const {isPublicResource,publicRoutes}=require('../src/lib/publicDocument');
const {validate,overlay,localize}=require('../src/lib/contentTranslations');
test('locale-aware SSR resources and public routes stay bounded',()=>{
 for(const path of ['/en','/en/articles','/en/article/hello-world'])assert.equal(publicRoutes.test(path),true,path);
 for(const path of ['/en/admin','/en/account/settings','/en/api/posts'])assert.equal(publicRoutes.test(path),false,path);
 assert.equal(isPublicResource('/posts/hello-world?locale=en'),true);
 for(const path of ['/posts/hello?locale=fr','/posts/hello?locale=en&locale=zh-CN','/article-drafts/1?locale=en','//evil.test/posts'])assert.equal(isPublicResource(path),false,path);
});
test('English article SEO uses independent canonical and reciprocal published-only alternates',()=>{
 const meta=seo.articleMeta({id:8,slug:'hello',title:'Hello',content:'English body',content_locale:'en',available_locales:['zh-CN','en'],published_at:'2026-01-01'});
 assert.match(meta.canonical,/\/en\/article\/hello$/);assert.equal(meta.jsonLd.inLanguage,'en');
 assert.equal(meta.alternates.length,3);
 const html=seo.renderHtml('<html lang="zh-CN"><head><link rel="alternate" hreflang="de" href="/old"></head></html>',meta);
 assert.match(html,/<html lang="en">/);assert.doesNotMatch(html,/hreflang="de"/);assert.match(html,/og:locale" content="en_US"/);
 assert.equal(seo.articleMeta({id:1}).alternates.some(x=>x.locale==='en'),false);
});
test('translation overlay cannot modify identity, URL or visibility and draft never goes public',async()=>{
 assert.throws(()=>validate('project',{id:'5'}));assert.throws(()=>validate('blog_pages',{about:{enabled:'true'}}));
 assert.throws(()=>validate('site',{hero:{primary_link:'https://evil.test'}}));
 const original={id:2,name:'原文',url:'/original',enabled:false};
 assert.deepEqual(overlay(original,{id:9,name:'Translated',url:123,enabled:true}),{...original,name:'Translated'});
 const db={query:async()=>[[{draft:{name:'Draft secret'},published:null}]]};
 const row=await localize(db,'project',original,'en');assert.equal(row.name,'原文');assert.equal(row.content_locale,'zh-CN');
 await assert.rejects(()=>localize(db,'project',original,'en',{strict:true}),e=>e.status===404);
 db.query=async()=>[[{draft:{name:'Draft secret'},published:{name:'Public title'}}]];
 assert.equal((await localize(db,'project',original,'en')).name,'Public title');
});
test('SEO endpoint rejects untranslated English article without exposing source as English 200',async t=>{
 const {createSeoRouter}=require('../src/routes/seo');
 const db={query:async(sql,args)=>{
  if(sql.includes('site_settings'))return [[]];
  if(sql.includes('post_translations'))return [[]];
  if(sql.includes('JOIN users'))return [[{id:1,slug:'hello',title:'中文',content:'private source',status:'published'}]];
  return [[]];
 }};
 const app=express();app.use(createSeoRouter({db}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const response=await fetch(`http://127.0.0.1:${server.address().port}/api/seo?path=/en/article/hello`);
 assert.equal(response.status,404);const result=await response.json();assert.match(result.robots,/noindex/);assert.doesNotMatch(JSON.stringify(result),/private source/);
});

test('article documents and SEO endpoint preserve language-specific metadata and published alternates',async t=>{
 const {createSeoRouter}=require('../src/routes/seo');
 const original={id:1,slug:'hello',title:'中文标题',summary:'这里是足够长的中文文章简介，用于验证搜索结果摘要优先采用文章提供的简介内容。',content:'中文正文回退内容',status:'published'};
 const english={post_id:1,title:'English title',summary:'This published English summary is long enough to be used as the page description.',content:'English fallback body',published_at:'2026-01-01'};
 let translated=true;
 const db={query:async sql=>{
  if(sql.includes('site_settings'))return [[]];
  if(sql.includes('content_translations'))return [[]];
  if(sql.includes('post_translations'))return [[...(translated?[english]:[])]];
  if(sql.includes('JOIN users'))return [[original]];
  return [[]];
 }};
 const readTemplate=async()=>'<html lang="zh-CN"><head><title>old</title><meta name="description" content="old"><link rel="canonical" href="https://old.test"></head><body><div id="root"></div></body></html>';
 const renderDocument=async()=>({html:'',data:{resources:{},errors:{}}});
 const injectDocument=async html=>html;
 const app=express();app.use(createSeoRouter({db,readTemplate,renderDocument,injectDocument}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const origin=`http://127.0.0.1:${server.address().port}`;
 for(const [path,title,summary,canonical] of [
  ['/article/hello','中文标题',original.summary,'/article/hello'],
  ['/en/article/hello','English title',english.summary,'/en/article/hello'],
 ]){
  const response=await fetch(origin+path);assert.equal(response.status,200);const html=await response.text();
  assert.match(html,new RegExp(`<title>${title} · mooncci</title>`));assert.ok(html.includes(`name="description" content="${summary}"`));
  assert.equal((html.match(/name="description"/g)||[]).length,1);assert.equal((html.match(/rel="canonical"/g)||[]).length,1);
  assert.ok(html.includes(`rel="canonical" href="${seo.origin()+canonical}"`));assert.ok(html.includes('hreflang="zh-CN"'));assert.ok(html.includes('hreflang="en"'));assert.doesNotMatch(html,/noindex/);
  assert.equal((html.match(/hreflang="zh-CN"/g)||[]).length,1);assert.equal((html.match(/hreflang="en"/g)||[]).length,1);
  const api=await fetch(origin+'/api/seo?path='+encodeURIComponent(path)+'&locale=en');const meta=await api.json();
  assert.equal(meta.title,title+' · mooncci');assert.equal(meta.description,summary);assert.equal(meta.canonical,seo.origin()+canonical);assert.equal(meta.robots,'index, follow');
 }
 translated=false;
 const chinese=await fetch(origin+'/article/hello');const chineseHtml=await chinese.text();assert.equal(chinese.status,200);assert.doesNotMatch(chineseHtml,/hreflang="en"/);assert.doesNotMatch(chineseHtml,/noindex/);
 const englishMissing=await fetch(origin+'/en/article/hello');const missingHtml=await englishMissing.text();assert.equal(englishMissing.status,404);assert.doesNotMatch(missingHtml,/hreflang="en"|中文正文回退内容/);assert.match(missingHtml,/noindex/);
 original.summary='';const fallback=await fetch(origin+'/api/seo?path=%2Farticle%2Fhello&locale=en');assert.equal((await fallback.json()).description,original.content);
});

test('reordering shared settings lists keeps translations attached to their original records',()=>{
 const first={name:'甲',url:'https://a.test'},second={name:'乙',url:'https://b.test'};
 assert.deepEqual(overlay([second,first],[{name:'A'},{name:'B'}],[first,second]),[{...second,name:'B'},{...first,name:'A'}]);
 assert.deepEqual(overlay([{name:'New',url:'https://new.test'}],[{name:'A'}],[first]),[{name:'New',url:'https://new.test'}]);
});

test('nested site/about publication requires every editable nonempty leaf and shared visibility does not invalidate translations',async()=>{
 const {missingText}=require('../src/lib/contentTranslations');
 const source={about:{name:'站长',intro:'',enabled:true,avatar:'/avatar.png',headings:{story:'关于博客'},social:[{name:'邮箱',url:'mailto:a@example.test',enabled:true}],timeline:[{date:'2026',description:'上线',enabled:true}]},links:[]};
 const complete={about:{name:'Author',headings:{story:'About this blog'},social:[{name:'Email'}],timeline:[{date:'2026',description:'Launch'}]},links:[]};
 assert.deepEqual(missingText('blog_pages',source,complete),[]);
 assert.ok(missingText('blog_pages',source,{about:{name:'Author'}}).includes('about.timeline.0.description'));
 const db={query:async()=>[[{published:complete,published_source:source}]]};
 const hidden=structuredClone(source);hidden.about.social[0].enabled=false;
 assert.equal((await localize(db,'blog_pages',hidden,'en',{id:'1'})).content_locale,'en');
 const added=structuredClone(source);added.about.timeline.push({date:'2027',description:'新内容',enabled:true});
 const result=await localize(db,'blog_pages',added,'en',{id:'1'});assert.equal(result.content_locale,'zh-CN');assert.deepEqual(result.available_locales,['zh-CN']);
 db.query=async()=>[[{published:{about:{name:'Author'}},published_source:source}]];
 assert.equal((await localize(db,'blog_pages',source,'en',{id:'1'})).content_locale,'zh-CN');
});

test('missing template returns localized noindex 503 without JavaScript and English missing metadata stays English',async t=>{
 const {createSeoRouter}=require('../src/routes/seo');
 const app=express();app.use(createSeoRouter({db:{query:async()=>[[]]},readTemplate:async()=>{throw Error('isolated missing template');}}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}`;
 for(const [route,language,title] of [['/articles','zh-CN','页面暂时无法加载'],['/en/articles','en','This page is temporarily unavailable']]){
  const response=await fetch(base+route),html=await response.text();assert.equal(response.status,503);assert.match(response.headers.get('x-robots-tag'),/noindex/);assert.match(html,new RegExp('lang="'+language+'"'));assert.ok(html.includes(title));if(language==='en')assert.doesNotMatch(html,/\p{Script=Han}/u);
 }
 for(const route of ['/en/projects/missing','/en/updates/999','/en/category/missing','/en/admin/users']){
  const response=await fetch(base+'/api/seo?path='+encodeURIComponent(route)),meta=await response.json();assert.equal(response.status,404);assert.match(meta.robots,/noindex/);assert.doesNotMatch(meta.title+meta.description,/\p{Script=Han}/u);
 }
});

test('private metadata follows explicit UI locale without creating English public routes',async t=>{
 const {createSeoRouter}=require('../src/routes/seo');const app=express();app.use(createSeoRouter({db:{query:async()=>[[]]}}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}`;
 for(const path of ['/login','/admin-login','/register','/forgot-password','/reset-password','/complete-registration','/admin/users','/account','/account/settings','/electricity','/node-monitor']){
  for(const locale of ['en','zh-CN']){const response=await fetch(base+'/api/seo?'+new URLSearchParams({path,locale}));const meta=await response.json();assert.equal(response.status,200);assert.equal(meta.locale,locale);assert.equal(new URL(meta.canonical).pathname,path);assert.match(meta.robots,/noindex/);assert.deepEqual(meta.alternates,[]);if(locale==='en')assert.doesNotMatch(meta.title+meta.description,/\p{Script=Han}/u);}
  assert.equal((await fetch(base+'/api/seo?'+new URLSearchParams({path:'/en'+path,locale:'en'}))).status,404);
 }
 for(const [path,queryLocale,expected] of [['/articles','en','zh-CN'],['/en/articles','zh-CN','en']]){const meta=await(await fetch(base+'/api/seo?'+new URLSearchParams({path,locale:queryLocale}))).json();assert.equal(meta.locale,expected);}
});

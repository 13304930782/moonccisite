const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {articleSlugWriteError,isValidArticleSlug,validateArticleSlug,articlePath,decodeArticleReference,resolveArticle,claimArticleSlug}=require('../src/lib/articleSlug');
const {createSeoRouter}=require('../src/routes/seo');
const documents=require('../src/lib/publicDocument');

test('new slugs require meaningful lowercase English segments; unchanged legacy slugs remain editable',()=>{
 for(const value of ['cities-skylines-2-basic-mods','c-arrays','a','v2','a'.repeat(100)])assert.equal(isValidArticleSlug(value),true,value);
 for(const value of ['',null,23,'20','12-34','A-title','under_score','two--hyphens','-start','end-','文章','a'.repeat(101),'archives','meta','a/b','a?b','a#b']){
  assert.equal(isValidArticleSlug(value),false,String(value));
  assert.throws(()=>validateArticleSlug(value),e=>e.status===400,String(value));
 }
 assert.throws(()=>validateArticleSlug(''),/填写英文链接.*DeepSeek/);
 assert.equal(validateArticleSlug(' valid-slug '),'valid-slug');
 for(const legacy of ['cities:skylinesii-basic-mod','pingu企鹅','2024_11_6_develop-circulate','2024-11-13c%e8%af%ad']){
  assert.equal(validateArticleSlug(legacy,legacy),legacy);
  assert.throws(()=>validateArticleSlug(legacy,'current-slug'),e=>e.status===400);
  assert.equal(decodeArticleReference(articlePath({id:20,slug:legacy}).split('/').pop()),legacy);
 }
 for(const raw of ['%ZZ','%2Fsecret','foo%3Fsecret','foo%23secret','foo%5Csecret','foo%00bar'])assert.equal(decodeArticleReference(raw),null);
});

test('article lookup preserves numeric IDs, parameterizes legacy aliases and applies public visibility',async()=>{
 const calls=[];const db={query:async(sql,args)=>{calls.push({sql,args});return [[{id:20,slug:'current-slug',status:'published'}]];}};
 await resolveArticle(db,'20',{published:true});assert.deepEqual(calls[0].args,['20']);assert.match(calls[0].sql,/p.id=\?/);assert.match(calls[0].sql,/p.status='published'/);
 await resolveArticle(db,'legacy:slug',{published:true});assert.deepEqual(calls[1].args,['legacy:slug','legacy:slug']);assert.match(calls[1].sql,/article_slug_aliases/);
 for(const value of ['2147483648','9007199254740992','foo/bar','foo\\bar',''])assert.equal(await resolveArticle(db,value),null);
 assert.equal(calls.length,2);
});

test('slug reservations reject another owner and deleted article reservations',async()=>{
 for(const owner of [9,null])await assert.rejects(()=>claimArticleSlug({query:async(sql)=>sql.startsWith('SELECT')?[[{post_id:owner}]]:[{}]},20,'occupied'),e=>e.status===422);
 const claimed=[];await claimArticleSlug({query:async(sql,args)=>{if(sql.startsWith('INSERT'))claimed.push(args[0]);return sql.startsWith('SELECT')?[[{post_id:20}]]:[{}];}},20,'current','old');
 assert.deepEqual(claimed,['old','current']);
});

test('HTML redirects only published numeric or historical URLs and canonical metadata/sitemap use slugs',async t=>{
 const post={id:20,slug:'cities-skylines-2-basic-mods',title:'Cities guide',summary:'Public article summary',status:'published',author_name:'mooncci'};
 const legacy={id:16,slug:'2024-11-13c%e8%af%ad',title:'C language',status:'published'};
 const db={query:async(sql,args=[])=>{
  if(sql.includes('site_settings'))return [[{setting_value:'{}'}]];
  if(sql.includes('JOIN users')){assert.match(sql,/p.status='published'/);return [[...(['20',post.slug,'cities:skylinesii-basic-mod'].includes(args[0])?[post]:[]),...(args[0]===legacy.slug?[legacy]:[])]];}
  if(sql.startsWith('SELECT id,slug,'))return [[post,legacy]];
  return [[]];
 }};
 let renders=0;
 const app=express();app.use(createSeoRouter({db,readTemplate:async()=>'<html><head></head><body><div id="root"></div><script></script></body></html>',renderDocument:async(url,load,status)=>{renders++;return {html:'<main>Article</main>',data:{resources:{},errors:{},status,url}};},injectDocument:async html=>html}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 for(const key of ['20','cities%3Askylinesii-basic-mod']){
  const response=await fetch(base+'/article/'+key+'?utm_source=old&mode=read',{redirect:'manual'});
  assert.equal(response.status,301);assert.equal(response.headers.get('location'),'/article/'+post.slug+'?utm_source=old&mode=read');
 }
 assert.equal(renders,0,'redirects do not fetch or render the article twice');
 let response=await fetch(base+articlePath(post));assert.equal(response.status,200);assert.match(await response.text(),/rel="canonical" href="https:\/\/mooncci.site\/article\/cities-skylines-2-basic-mods"/);
 response=await fetch(base+articlePath(legacy));assert.equal(response.status,200,'percent-encoded historical slug is decoded once');
 for(const key of ['999','private-draft','old-private-slug','a%2Fb']){
  const response=await fetch(base+'/article/'+key,{redirect:'manual'});assert.equal(response.status,404,key);assert.equal(response.headers.get('location'),null);assert.doesNotMatch(await response.text(),/Public article summary|BlogPosting/);
 }
 response=await fetch(base+'/api/seo?path='+encodeURIComponent('/article/20'));assert.equal(response.status,200);const meta=await response.json();assert.equal(meta.canonical,'https://mooncci.site'+articlePath(post));assert.ok(meta.jsonLd['@graph'].some(x=>x['@type']==='BlogPosting'&&x.url===meta.canonical));
 const sitemap=await (await fetch(base+'/sitemap.xml')).text();assert.match(sitemap,/article\/cities-skylines-2-basic-mods/);assert.doesNotMatch(sitemap,/article\/20</);
});

test('SSR fetch accepts slug details/discovery but rejects malformed resources and private results',async t=>{
 for(const url of ['/posts/cities-skylines-2-basic-mods','/posts/cities%3Askylinesii-basic-mod/discovery','/posts/2024-11-13c%25e8%25af%25ad','/posts/archives','/posts/meta/tags'])assert.equal(documents.isPublicResource(url),true,url);
 for(const url of ['/posts/a%2Fb','/posts/%ZZ','/posts/meta','/posts/by-slug/secret','/posts/cities?status=draft'])assert.equal(documents.isPublicResource(url),false,url);
 const original=global.fetch;global.fetch=async()=>new Response(JSON.stringify({id:20,status:'draft'}),{headers:{'Content-Type':'application/json'}});t.after(()=>global.fetch=original);
 await assert.rejects(()=>documents.loadPublicResource('/posts/current-slug'),e=>e.status===404);
 await assert.rejects(()=>documents.loadPublicResource('/posts/current-slug?page=1'),e=>e.status===404);
});


test('only the posts slug unique-key error becomes an editable 422 validation failure',()=>{
 for(const key of ['slug','posts.slug'])assert.equal(articleSlugWriteError({code:'ER_DUP_ENTRY',sqlMessage:`Duplicate entry 'used-slug' for key '${key}'`}).status,422);
 for(const error of [{code:'ER_DUP_ENTRY',sqlMessage:"Duplicate entry 'id' for key 'article_drafts.PRIMARY'"},{code:'ER_LOCK_DEADLOCK',message:'deadlock'},{status:409,message:'version changed'}])assert.equal(articleSlugWriteError(error),error);
});

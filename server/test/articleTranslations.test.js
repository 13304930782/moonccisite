const test=require('node:test'),assert=require('node:assert/strict');
const {locale,sourceHash,publicPosts,publicPost,prepareSummary}=require('../src/lib/articleTranslations');
test('locale is a strict whitelist; source hash excludes counters, dates and shared associations',()=>{
 assert.equal(locale(),'zh-CN');assert.equal(locale('en'),'en');for(const v of ['EN','en-US',{},['en'],'../en'])assert.throws(()=>locale(v),{status:400});
 const p={title:'中文',summary:'简介',content:'正文'};assert.equal(sourceHash(p),sourceHash({...p,views:4,updated_at:'later',tags:['new']}));assert.notEqual(sourceHash(p),sourceHash({...p,content:'new'}));
});
test('public overlays preserve one identity and hide translation drafts and unpublished parents',async()=>{
 const post={id:7,author_id:4,status:'published',title:'中文',summary:'摘要',content:'原文',slug:'one',published_at:'original'};
 const translation={post_id:7,locale:'en',title:'English',summary:'Summary',content:'Body',status:'published',version:2,published_at:'translated'};
 const db={query:async(sql,args)=>{assert.match(sql,/status='published'/);assert.deepEqual(args,[[7]]);return [[translation]];}};
 const en=await publicPost(db,post,'en');assert.equal(en.id,7);assert.equal(en.author_id,4);assert.equal(en.slug,'one');assert.equal(en.content,'Body');assert.equal(en.source_published_at,'original');assert.equal(en.published_at,'translated');assert.deepEqual(en.available_locales,['zh-CN','en']);
 const missing={query:async()=>[[]]};assert.equal((await publicPosts(missing,[post],'en'))[0].content_locale,'zh-CN');await assert.rejects(publicPost(missing,post,'en'),{status:404,code:'TRANSLATION_UNAVAILABLE'});await assert.rejects(publicPost(db,{...post,status:'draft'},'en'),{status:404});
});
test('English summaries are manual and never invoke Chinese AI configuration or external requests',async()=>{
 const result=await prepareSummary({query(){throw Error('must not query');}},{title:'English',summary:'',summary_mode:'ai',summary_receipt:'old'},1,'en');assert.equal(result.summary_mode,'manual');assert.equal(result.summary_receipt,'');
});
test('revision scopes separate locale for both existing articles and unbound drafts',()=>{
 const {scope}=require('../src/lib/articleRevisions');assert.deepEqual(scope({post_id:1,locale:'en'}),['post_id=? AND locale=?',[1,'en']]);assert.deepEqual(scope({post_id:1}),['post_id=? AND locale=?',[1,'zh-CN']]);assert.deepEqual(scope({id:'draft',locale:'en'}),['post_id IS NULL AND draft_id=? AND locale=?',['draft','en']]);
});

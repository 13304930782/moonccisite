const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
test('RSS localizes published activity while preserving identities, dates and explicit source fallback',async()=>{
 const file=path.resolve(__dirname,'../src/services/newsletter.js'),localRequire=createRequire(file),queries=[];
 const box={exports:{}};
 const source={id:7,type:'post',title:'原文',excerpt:'中文正文',path:'/article/shared',published_at:'2026-01-01T00:00:00Z',content_locale:'zh-CN'};
 new Function('require','module','exports',fs.readFileSync(file,'utf8'))(name=>{
  if(name==='../platformDb')return {};
  if(name==='../lib/mailer'||name==='./newsletterReview')return {};
  if(name==='../lib/siteIdentity')return {siteOrigin:()=> 'https://example.invalid'};
  if(name==='../repositories/activityRepository')return {activity:async query=>{queries.push(query);return {items:query.locale==='en'?[{...source,title:'English article',excerpt:'Published English',path:'/en/article/shared',content_locale:'en'},{...source,id:8}]:[source]};}};
  return localRequire(name);
 },box,box.exports);
 const zh=await box.exports.rss(),en=await box.exports.rss('en');
 assert.deepEqual(queries,[{pageSize:50,locale:'zh-CN'},{pageSize:50,locale:'en'}]);
 assert.match(zh,/<language>zh-cn<\/language>/);assert.match(en,/<language>en<\/language>/);
 assert.match(en,/href="https:\/\/example.invalid\/api\/feed.xml\?locale=en"/);
 assert.match(en,/<link>https:\/\/example.invalid\/en\/article\/shared<\/link>/);
 assert.match(en,/\[Chinese only\] 中文正文/);assert.match(en,/<link>https:\/\/example.invalid\/article\/shared<\/link>/);
 for(const xml of [zh,en]){assert.match(xml,/urn:mooncci:post:7/);assert.match(xml,/Thu, 01 Jan 2026 00:00:00 GMT/);}
 assert.equal((en.match(/urn:mooncci:post:7/g)||[]).length,1);
});

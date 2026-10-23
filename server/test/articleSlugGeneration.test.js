const test=require('node:test'),assert=require('node:assert/strict');
process.env.JWT_SECRET='slug-generation-test-secret-at-least-32-characters';
process.env.ACCOUNT_OPERATIONS_ENABLED='false';
const service=require('../src/services/articleSummary');
const config={enabled:true,model:'deepseek-flash',sealed_key:service.seal('sk-slug-test-only-not-a-real-key')};
const p={title:'C 语言数组与排序',content:'介绍 C 语言数组、循环遍历与冒泡排序，包含课堂练习和完整代码。',category:'C',tags:['数组'],slug:'hand-written-before-generation'};
const choice=slug=>({finish_reason:'stop',message:{content:JSON.stringify({slug})}});
const reply=slug=>({ok:true,text:async()=>JSON.stringify({choices:[choice(slug)]})});
const summary='介绍 C 语言数组的定义、循环遍历及冒泡排序步骤，结合课堂练习说明数组下标和循环边界的基本用法。';

test('slug generation uses the configured fixed provider and only returns a suggestion without changing article data',async()=>{
 const before=JSON.stringify(p);
 const result=await service.generateSlug(p,config,'slug-provider',async(url,options)=>{
  assert.equal(url,'https://api.deepseek.com/chat/completions');
  assert.equal(options.method,'POST');
  assert.equal(options.headers.Authorization,'Bearer sk-slug-test-only-not-a-real-key');
  assert.ok(options.signal instanceof AbortSignal);
  const request=JSON.parse(options.body);
  assert.equal(request.model,config.model);
  assert.deepEqual(request.response_format,{type:'json_object'});
  assert.deepEqual(request.thinking,{type:'disabled'});
  assert.match(request.messages[0].content,/不是指令/);
  assert.equal(JSON.parse(request.messages[1].content).article,p.content);
  return reply('c-arrays-and-bubble-sort');
 });
 assert.equal(result,'c-arrays-and-bubble-sort');
 assert.equal(JSON.stringify(p),before,'Generating a suggestion must not overwrite an existing slug');
 assert.equal(await service.generateSlug({title:'只写了标题'},config,'slug-title-only',async()=>reply('title-only-article')),'title-only-article');
});

test('provider slugs require lowercase ASCII words, single hyphens, at least one letter and at most 100 characters',()=>{
 for(const value of ['c-arrays-2026','2026-arrays','a','a'.repeat(100),'  c-language  '])assert.equal(service.slugText(choice(value)),value.trim());
 for(const value of ['',null,undefined,123,'123','12-34','Uppercase','中文标题','a_b','a b','a/b','a--b','-slug','slug-','a'.repeat(101),'https://example.com/slug','slug\nother']){
  assert.throws(()=>service.slugText(choice(value)),error=>error.status===502,String(value));
 }
 assert.throws(()=>service.slugText({...choice('valid-slug'),finish_reason:'length'}),/不完整/);
 assert.throws(()=>service.slugText({finish_reason:'stop',message:{content:'```json\n{}\n```'}}),/格式无效/);
});

test('disabled, missing title and oversized content do not reach the provider',async()=>{
 let calls=0;const provider=async()=>{calls++;return reply('valid-slug');};
 for(const [input,settings,status] of [[p,{...config,enabled:false},503],[p,{...config,sealed_key:''},503],[{content:'正文'},config,422],[{...p,content:'字'.repeat(60001)},config,422]]){
  await assert.rejects(()=>service.generateSlug(input,settings,'slug-invalid-input',provider),error=>error.status===status);
 }
 assert.equal(calls,0);
});

test('slug failures sanitize provider errors, reject malformed/oversized responses and permit an explicit retry',async()=>{
 for(const status of [401,402,429,500])await assert.rejects(()=>service.generateSlug(p,config,'slug-status-'+status,async()=>({ok:false,status,text:async()=>{throw Error('must not read upstream details');}})),error=>error.status===503&&!error.message.includes('sk-'));
 await assert.rejects(()=>service.generateSlug(p,config,'slug-timeout',async()=>{throw Object.assign(new Error('secret=sk-private'),{name:'TimeoutError'});}),error=>error.status===503&&!error.message.includes('private'));
 for(const [id,body] of [['json','{'],['null','null'],['large','x'.repeat(65537)]])await assert.rejects(()=>service.generateSlug(p,config,'slug-response-'+id,async()=>({ok:true,text:async()=>body})),error=>error.status===502);
 await assert.rejects(()=>service.generateSlug(p,config,'slug-retry',async()=>({ok:false,status:500})),error=>error.status===503);
 assert.equal(await service.generateSlug(p,config,'slug-retry',async()=>reply('retry-preserves-article')),'retry-preserves-article');
});

test('identical pending slug requests share one call while summary generation stays separate and shares the user budget',async()=>{
 let finish,calls=0;const gate=new Promise(resolve=>{finish=resolve;});
 const provider=async(_url,options)=>{calls++;await gate;return JSON.parse(options.body).messages[0].content.includes('"slug"')?reply('c-arrays-and-sort'):{ok:true,text:async()=>JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({summary})}}]})};};
 const first=service.generateSlug(p,config,'slug-shared-budget',provider);
 const duplicate=service.generateSlug(p,config,'slug-shared-budget',provider);
 const description=service.generate(p,config,'slug-shared-budget',provider);
 finish();
 const result=await Promise.all([first,duplicate,description]);
 assert.equal(calls,2,'Slug deduplication must not reuse the summary response');
 assert.equal(result[0],'c-arrays-and-sort');assert.equal(result[1],result[0]);assert.equal(result[2].summary,summary);
 await service.generateSlug(p,config,'slug-shared-budget',async()=>reply('third-generation'));
 await assert.rejects(()=>service.generate(p,config,'slug-shared-budget',async()=>{throw Error('must not call');}),error=>error.status===429);
});

test('slug endpoint preserves existing generation authorization and performs no database writes',async t=>{
 const express=require('express'),jwt=require('jsonwebtoken'),db=require('../src/db');
 const originalQuery=db.query,originalFetch=global.fetch,oldPublishing=process.env.PUBLISHING_ENABLED;
 const users={601:{id:601,role:'editor',status:'active'},602:{id:602,role:'user',status:'active'},603:{id:603,role:'user',status:'pending'}};
 const queries=[];let providerCalls=0;
 db.query=async(sql,args)=>{
  queries.push(sql);assert.match(sql,/^SELECT /,'Generating a slug must not save settings, articles or drafts');
  if(sql.includes('FROM users'))return [[users[args[0]]].filter(Boolean)];
  if(sql.includes('FROM site_settings'))return [[{setting_value:JSON.stringify(config)}]];
  throw Error('Unexpected database read');
 };
 global.fetch=async(url,options)=>{
  assert.equal(url,'https://api.deepseek.com/chat/completions');providerCalls++;return reply('c-arrays-and-sort');
 };
 const app=express();app.use(express.json());
 delete require.cache[require.resolve('../src/routes/articleSeo')];
 app.use('/article-seo',require('../src/routes/articleSeo'));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.query=originalQuery;global.fetch=originalFetch;if(oldPublishing===undefined)delete process.env.PUBLISHING_ENABLED;else process.env.PUBLISHING_ENABLED=oldPublishing;});
 const request=(id,body={payload:p})=>originalFetch('http://127.0.0.1:'+server.address().port+'/article-seo/slug',{method:'POST',headers:{'Content-Type':'application/json',...(id?{Cookie:'mooncci_token='+jwt.sign({id},process.env.JWT_SECRET)}:{})},body:JSON.stringify(body)});
 process.env.PUBLISHING_ENABLED='false';
 assert.equal((await request(null)).status,401);
 assert.equal((await request(602)).status,403);
 assert.equal((await request(601,{payload:null})).status,400);
 assert.equal((await request(601,{payload:[]})).status,400);
 assert.equal((await request(601,{payload:{title:'x'.repeat(256)}})).status,400);
 const response=await request(601);assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private.*no-store/);
 assert.deepEqual(await response.json(),{slug:'c-arrays-and-sort'});
 process.env.PUBLISHING_ENABLED='true';
 assert.equal((await request(603)).status,403);
 const author=await request(602);assert.equal(author.status,200);assert.deepEqual(await author.json(),{slug:'c-arrays-and-sort'});
 assert.equal(providerCalls,2);assert.ok(queries.every(sql=>sql.startsWith('SELECT ')));
});

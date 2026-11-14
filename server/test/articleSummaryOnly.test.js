const test=require('node:test'),assert=require('node:assert/strict');
process.env.JWT_SECRET='summary-only-test-secret-at-least-32-characters';
const service=require('../src/services/articleSummary');
const config={enabled:true,model:'deepseek-flash',sealed_key:service.seal('sk-test-only')};
test('summary translation sends only the summary and retains permissions and version checks',async t=>{
 const express=require('express'),jwt=require('jsonwebtoken'),db=require('../src/db');
 const oldQuery=db.query,oldFetch=global.fetch;
 const users={901:{id:901,role:'editor',status:'active'},902:{id:902,role:'user',status:'active'}};
 let version=4,calls=0,answer='Translate only this summary';
 db.query=async(sql,args)=>{
  assert.match(sql,/^SELECT /);
  if(sql.includes('FROM users'))return [[users[args[0]]].filter(Boolean)];
  if(sql.includes('FROM site_settings'))return [[{setting_value:JSON.stringify(config)}]];
  if(sql.includes('FROM posts'))return [[{id:7,author_id:901,version}]];
  throw Error('Unexpected query: '+sql);
 };
 global.fetch=async(_url,options)=>{
  calls++;const req=JSON.parse(options.body),segments=JSON.parse(req.messages[1].content).segments;
  assert.deepEqual(segments,['只翻译这段简介']);
  return {ok:true,text:async()=>JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({segments:[answer]})}}]})};
 };
 const app=express();app.use(express.json());app.use('/article-seo',require('../src/routes/articleSeo'));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.query=oldQuery;global.fetch=oldFetch;});
 const body={summaryOnly:true,sourcePostId:7,sourceBaseVersion:4,payload:{title:'秘密标题',summary:'只翻译这段简介',content:'秘密正文'}};
 const request=(id,data=body)=>oldFetch(`http://127.0.0.1:${server.address().port}/article-seo/translate`,{method:'POST',headers:{'Content-Type':'application/json',...(id?{Cookie:'mooncci_token='+jwt.sign({id},process.env.JWT_SECRET)}:{})},body:JSON.stringify(data)});
 assert.equal((await request()).status,401);
 assert.equal((await request(902)).status,403);
 assert.equal((await request(901,{...body,payload:{...body.payload,summary:'  '}})).status,400);
 version=5;assert.equal((await request(901)).status,409);version=4;
 const response=await request(901);assert.equal(response.status,200);assert.deepEqual(await response.json(),{summary:'Translate only this summary'});assert.equal(calls,1);
 answer='A translated summary '.repeat(15).trim();assert.ok(answer.length>255);
 const longResponse=await request(901);assert.equal(longResponse.status,200);assert.deepEqual(await longResponse.json(),{summary:answer});assert.equal(calls,2);
});

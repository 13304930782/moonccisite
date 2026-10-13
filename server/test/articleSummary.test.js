const test=require('node:test'),assert=require('node:assert/strict');
process.env.JWT_SECRET='test-summary-secret-with-at-least-32-characters';
const service=require('../src/services/articleSummary'),proof=require('../src/lib/articleSummaryProof');
const {payload}=require('../src/lib/articlePublishing');
const summary='介绍 C 语言数组的定义方式，并通过读入十个整数、逐项比较交换和输出结果的代码示例，记录数组遍历与冒泡排序的基本写法，方便结合课堂练习理解循环和数组下标。';
const p=payload({title:'C 语言数组',content:'一、数组定义\n```c\n#include <stdio.h>\nint a[10];\nfor(int i=0;i<10;i++) scanf("%d",&a[i]);\n```',category:'C',tags:['数组']});
const config={enabled:true,model:'deepseek-flash',sealed_key:service.seal('sk-test-only-not-a-real-api-key')};
const reply=value=>({ok:true,text:async()=>JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({summary:value})}}]})});
test('provider receives code, JSON mode and server-only authorization; generated summary has a version-bound receipt',async()=>{
 const result=await service.generate(p,config,'format',async(url,options)=>{assert.equal(url,'https://api.deepseek.com/chat/completions');assert.equal(options.headers.Authorization,'Bearer sk-test-only-not-a-real-api-key');const request=JSON.parse(options.body);assert.deepEqual(request.response_format,{type:'json_object'});assert.equal(request.thinking.type,'disabled');assert.match(request.messages[1].content,/#include <stdio.h>/);return reply(summary);});
 assert.equal(result.summary,summary);assert.equal(result.summary_mode,'ai');assert.ok(proof.valid(result));assert.doesNotThrow(()=>proof.assertReady(result));assert.equal(require('../src/lib/seo').articleMeta({...result,id:16}).description,summary);assert.ok(!JSON.stringify(result).includes('sk-test'));
 for(const field of ['title','content','category','tags','summary']){const changed={...result,[field]:field==='tags'?['新标签']:result[field]+'changed'};assert.equal(proof.valid(changed),false);assert.throws(()=>proof.assertReady(changed),/重新生成/);}
});
test('manual descriptions never invoke provider or read AI settings',async()=>{const manual={...p,summary:'我的手写简介',summary_mode:'manual'};assert.equal(await service.prepare({query:()=>{throw Error('unexpected')}},manual,'manual'),manual);});
test('existing generated receipt reuses the approved summary without provider or settings calls',async()=>{const value={...p,summary,summary_mode:'ai'};value.summary_receipt=proof.signature(value);assert.equal(await service.prepare({query:()=>{throw Error('unexpected')}},value,'cache'),value);});
test('blank summary automatically generates when enabled; disabled feature preserves legacy workflow',async()=>{const db={query:async()=>[[{setting_value:JSON.stringify(config)}]]};const result=await service.prepare(db,p,'auto',{fetcher:async()=>reply(summary)});assert.ok(proof.valid(result));assert.equal(await service.prepare({query:async()=>[[]]},p,'off'),p);await assert.rejects(()=>service.prepare({query:async()=>[[]]},{...p,summary_mode:'ai'},'off'),/尚未启用/);});
test('invalid JSON, truncated output, short, extreme length, HTML and links fail with specific reasons without publishing',async()=>{
 const invalid=[['过短',/不足 25 字/],['字'.repeat(2001),/过长/],[summary+'<script>',/不支持的标记/],['https://example.com '+summary,/链接/],[summary+'**未结束',/不支持的标记/],[summary+'`未结束',/不支持的标记/]];
 for(let i=0;i<invalid.length;i++)await assert.rejects(()=>service.generate(p,config,'invalid'+i,async()=>reply(invalid[i][0])),invalid[i][1]);
 await assert.rejects(()=>service.generate(p,config,'badjson',async()=>({ok:true,text:async()=>'{'})),/格式无效/);
 await assert.rejects(()=>service.generate(p,config,'truncated',async()=>({ok:true,text:async()=>JSON.stringify({choices:[{finish_reason:'length',message:{content:'{}'}}]})})),/不完整/);
});
const choice=value=>({finish_reason:'stop',message:{content:JSON.stringify({summary:value})}});
test('ordinary whitespace and inline typography become plain descriptions without changing wording',()=>{
 const value=summary.replace('C 语言','`C 语言`').replace('数组','**数组**').replace('记录','__记录__').replace('并通过','\n\n并通过');
 assert.equal(service.summaryText(choice(value)),summary.replace('并通过',' 并通过'));
 assert.throws(()=>service.summaryText(choice(undefined)),/没有返回/);
 assert.throws(()=>service.summaryText({finish_reason:'stop',message:{content:'```json\n{}\n```'}}),/格式无效/);
});
test('long descriptions prefer a complete sentence and keep a valid receipt with exactly one provider call',async()=>{
 const sentence='本文介绍都市天际线二的公交与列车停站时间设置，说明如何用快速上客模组缓解车辆长时间停站，并记录不同道路的人行天桥架设步骤与注意事项，同时标注天桥模组因游戏更新失效后的替代方案。';
 assert.ok(Array.from(sentence).length>=80&&Array.from(sentence).length<160);
 let calls=0;
 const result=await service.generate(p,config,'normalization',async()=>{calls++;return reply(sentence+'更多补充信息'.repeat(20));});
 assert.equal(result.summary,sentence);assert.equal(calls,1);assert.ok(proof.valid(result));
});
test('overlong clauses preserve Unicode, Latin word boundaries, and the 160-character limit',()=>{
 const clause='内容'.repeat(45)+'，';
 assert.equal(service.summaryText(choice(clause+'补充说明'.repeat(40))),clause.slice(0,-1)+'…');
 const unicode=service.summaryText(choice('知识'.repeat(79)+'😀😀😀'));
 assert.equal(Array.from(unicode).length,160);assert.ok(unicode.endsWith('😀…'));assert.ok(unicode.isWellFormed());
 const words=service.summaryText(choice('内容'.repeat(76)+' DeepSeekImportantWord '+'补充'.repeat(50)));
 assert.equal(words,'内容'.repeat(76)+'…');assert.ok(Array.from(words).length<=160);
 const closingQuote=service.summaryText(choice('内容'.repeat(78)+'，”'+'补充'.repeat(50)));
 assert.ok(Array.from(closingQuote).length<=160);
});
test('provider failure is safely explained without leaking its response or credentials',async()=>{
 for(const status of [401,402,429,500])await assert.rejects(()=>service.generate(p,config,'status'+status,async()=>({ok:false,status,text:async()=>{throw Error('must not read provider body')}})),e=>e.status===503&&!e.message.includes('sk-'));
 await assert.rejects(()=>service.generate(p,config,'network',async()=>{throw Error('secret=sk-sensitive')}),e=>e.status===503&&!e.message.includes('sensitive'));
});
test('same pending source shares one API call; per-user requests are bounded',async()=>{let resolve,calls=0;const wait=new Promise(r=>resolve=r);const provider=async()=>{calls++;await wait;return reply(summary);};const a=service.generate(p,config,'dedup',provider),b=service.generate(p,config,'dedup',provider);resolve();const values=await Promise.all([a,b]);assert.equal(calls,1);assert.deepEqual(values[0],values[1]);for(let i=0;i<3;i++)await service.generate(p,config,'limit',async()=>reply(summary));await assert.rejects(()=>service.generate(p,config,'limit',async()=>reply(summary)),e=>e.status===429);});
test('rich text preserves code and boundaries, discards active HTML; very short and oversized articles do not incur charges',async()=>{const text=service.articleText('<!--mooncci-richtext:v1--><p>数组</p><pre><code>int a[10];</code></pre><script>secret</script><style>bad</style><p>排序</p>');assert.match(text,/int a\[10\];/);assert.match(text,/数组\n/);assert.doesNotMatch(text,/secret|bad/);for(const content of ['咕咕嘎嘎','字'.repeat(60001)])await assert.rejects(()=>service.generate({...p,content},config,'content',()=>{throw Error('must not call')}));});
test('encrypted configuration never discloses API key; empty key preserves it and only valid models are accepted',async()=>{let saved;const db={query:async(sql,args)=>{if(sql.startsWith('SELECT'))return [[{setting_value:JSON.stringify(saved||{})}]];saved=JSON.parse(args[1]);return [[]];}};const result=await service.saveConfig(db,{enabled:true,model:'deepseek-flash',api_key:'sk-test-only-not-a-real-api-key'});assert.deepEqual(result,{enabled:true,model:'deepseek-flash',has_key:true});assert.ok(!JSON.stringify(saved).includes('sk-'));assert.equal(service.open(saved.sealed_key),'sk-test-only-not-a-real-api-key');const previous=saved.sealed_key;await service.saveConfig(db,{enabled:false,model:'deepseek-v4-pro',api_key:''});assert.equal(saved.sealed_key,previous);await assert.rejects(()=>service.saveConfig(db,{enabled:true,model:'invented'}));assert.throws(()=>service.open(saved.sealed_key+'x'),/无法读取/);});

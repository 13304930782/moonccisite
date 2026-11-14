const test=require('node:test'),assert=require('node:assert/strict');
process.env.JWT_SECRET='translation-test-secret-only-more-than-32-characters';
const summary=require('../src/services/articleSummary'),service=require('../src/services/articleTranslationAI');
const config={enabled:true,model:'deepseek-flash',sealed_key:summary.seal('sk-test-key-value')};
const response=segments=>({ok:true,text:async()=>JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({segments})}}]})});
test('translates prose while preserving markdown, destinations and code',async()=>{
 const p={title:'中文标题',summary:'中文简介',content:'# 标题\n查看 [中文链接](https://example.com/a_(b)) 和 ![图片](/img.png)\n\n```js\nconst 中文 = "保留";\n```\n行内 `代码` 与公式 $x_1$。'};
 const translated=await service.translate(p,config,'markdown',async(_url,options)=>{const request=JSON.parse(options.body);return response(JSON.parse(request.messages[1].content).segments.map(text=>text.replace(/[\p{Script=Han}]+/gu,'English')));});
 assert.equal(translated.title,'English');assert.equal(translated.summary,'English');
 assert.match(translated.content,/\[English\]\(https:\/\/example\.com\/a_\(b\)\)/);
 assert.match(translated.content,/!\[English\]\(\/img\.png\)/);
 assert.ok(translated.content.includes('```js\nconst 中文 = "保留";\n```'));assert.ok(translated.content.includes('`代码`'));assert.ok(translated.content.includes('$x_1$'));
});
test('keeps rich-text markup and escapes ampersands in translated prose',async()=>{
 const content='<!--mooncci-richtext:v1-->\n<p>中文 <a href="https://example.com?a=1&amp;b=2">链接</a></p><pre><code>中文代码</code></pre><img src="/picture.png" alt="原始图片">';
 const result=await service.translate({title:'标题',summary:'',content},config,'html',async(_url,options)=>response(JSON.parse(JSON.parse(options.body).messages[1].content).segments.map(()=>'Fish & Chips')));
 assert.ok(result.content.startsWith('<!--mooncci-richtext:v1-->'));assert.ok(result.content.includes('<a href="https://example.com?a=1&amp;b=2">Fish &amp; Chips</a>'));assert.ok(result.content.includes('<pre><code>中文代码</code></pre><img src="/picture.png" alt="原始图片">'));
});
test('preserves markdown lists, tasks, quotes, tables, references and escapes',async()=>{
 const content='# 标题\n- 苹果\n  - 香蕉\n1. 第一项\n  2. 第二项\n- [x] 完成\n- [ ] 待办\n> 引用\n> - 嵌套\n\n| 名称 | 描述 |\n| :--- | ---: |\n| 咖啡 | 热饮 |\n\n---\n\\*字面星号\\* [链接][标识]\n[标识]: /image_(1).png';
 const result=await service.translate({title:'标题',summary:'',content},config,'structure',async(_url,options)=>response(JSON.parse(JSON.parse(options.body).messages[1].content).segments.map(text=>text.replace(/[\p{Script=Han}]+/gu,'English'))));
 assert.equal(result.content,content.replace(/标题|苹果|香蕉|第一项|第二项|完成|待办|引用|嵌套|名称|描述|咖啡|热饮|字面星号|链接/g,'English'));
});
test('long prose is split without silent loss and incomplete or malformed replies fail',async()=>{
 let calls=0;const p={title:'标题',summary:'',content:'甲'.repeat(4300)};
 const result=await service.translate(p,config,'long',async(_url,options)=>{calls++;return response(JSON.parse(JSON.parse(options.body).messages[1].content).segments.map(s=>'x'.repeat(s.length)));});
 assert.ok(calls>=3);assert.equal(result.content.length,4300);
 await assert.rejects(()=>service.translate(p,config,'truncated',async()=>({ok:true,text:async()=>JSON.stringify({choices:[{finish_reason:'length',message:{content:'{}'}}]})})),/未完成/);
 await assert.rejects(()=>service.translate(p,config,'missing',async()=>response([])),/不完整/);
 await assert.rejects(()=>service.translate(p,config,'injection',async(_url,options)=>response(JSON.parse(JSON.parse(options.body).messages[1].content).segments.map(()=>'<script>'))),/不完整/);
 await assert.rejects(()=>service.translate({...p,content:'甲'.repeat(60001)},config,'too-long',async()=>{throw Error('unexpected')}),/6 万字/);
});
test('unsupported complex syntax is rejected before contacting the provider',async()=>{
 const bad=['````markdown\n```js\nconst 中文=1;\n```\n````','```md\n```foo\nconst 中文=1;\n```bar\nconst 另一个=2;\n```','```js\nconst a="```";\nconst 中文=1;\nconst b="```";\nconst 数据=2;\n```','- 一级\n    - 二级','> 引用\n>\n>     const 中文=1;','未闭合\n```js\n中文代码','行内 ``中文代码``','[文字](/path(a(b)c))','[示例]\n[示例]: https://example.com','[示例][]\n[示例]: https://example.com','<!--'.repeat(10000),'<pre>'.repeat(10000),'<style>中文代码</style>','<textarea>中文内容</textarea>','<script>代码</script>'];
 for(let i=0;i<bad.length;i++)await assert.rejects(()=>service.translate({title:'标题',summary:'',content:bad[i]},config,'syntax'+i,async()=>{throw Error('provider must not be called')}),/格式|围栏|行内代码|链接|注释|代码标签/);
});
test('cancelled translation does not call the provider and in-flight work is bounded',async()=>{
 const p={title:'标题',summary:'',content:'正文'};const cancelled=new AbortController();cancelled.abort();
 await assert.rejects(()=>service.translate(p,config,'cancelled',async()=>{throw Error('unexpected')},cancelled.signal),/已取消/);
 let release;const hold=new Promise(resolve=>release=resolve);let ready;const started=new Promise(resolve=>ready=resolve);
 const first=service.translate(p,config,'concurrent',async(_url,options)=>{ready();await hold;return response(JSON.parse(JSON.parse(options.body).messages[1].content).segments.map(()=> 'English'));});
 await started;await assert.rejects(()=>service.translate(p,config,'concurrent',async()=>{throw Error('unexpected')}),/正在进行/);release();await first;
});

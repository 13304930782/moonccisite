import assert from 'node:assert/strict';
import {renderDocument} from '../server/runtime/document.mjs';
const post={id:7,status:'published',title:'公开文章',summary:'摘要',content:'# 标题\n\n正文测试\n\n```js\nconst a=1\n```',tags:'["React"]',author_name:'作者',published_at:'2026-01-01',updated_at:'2026-01-01'};
const settings={brand:{site_title:'mooncci'},hero:{title:'首页标题'},footer:{}};
async function load(path) {
 if(path==='/settings/site')return settings;
 if(path==='/publishing/config')return {enabled:true};
 if(path==='/subscriptions/status')return {available:false};
 if(path==='/posts/7')return post;
 if(path.endsWith('/discovery'))return {previous:null,next:null,related:[]};
 return {items:[post],total:13,page:1,pageSize:12};
}
const article=await renderDocument('/article/7',load);
assert.match(article.html,/正文测试/);assert.match(article.html.replace(/<[^>]+>/g,''),/const a=1/);assert.match(article.html,/detail-title/);
assert.ok(!article.html.includes('startup-shell'));
const list=await renderDocument('/articles',load);
assert.match(list.html,/href="\/articles\?page=2"/);
const rich=await renderDocument('/article/7',p=>p==='/posts/7'?Promise.resolve({...post,content:'<!--mooncci-richtext:v1--><h2>富文本</h2><p>安全正文<script>alert(1)</script><img src="javascript:alert(1)" onerror="bad()"></p>'}):load(p));
assert.match(rich.html,/安全正文/);assert.ok(!rich.html.includes('onerror='));assert.ok(!rich.html.includes('javascript:'));assert.ok(!rich.html.includes('<script>alert'));
const [a,b]=await Promise.all(['甲','乙'].map(title=>renderDocument('/article/7',p=>p==='/posts/7'?Promise.resolve({...post,title}):load(p))));
assert.equal(a.data.resources['/posts/7'].title,'甲');assert.equal(b.data.resources['/posts/7'].title,'乙');
const missing=await renderDocument('/articles?page=999',load,404);
assert.match(missing.html,/这个页面没有找到/);assert.ok(!missing.html.includes('公开文章'));
console.log('SSR acceptance: Markdown, rich text sanitization, pagination, request isolation and 404 passed.');

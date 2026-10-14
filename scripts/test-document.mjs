import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
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
assert.match(article.html,/正文测试/);assert.match(JSDOM.fragment(article.html).textContent,/const a=1/);assert.match(article.html,/detail-title/);
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

// Check the HTML sent before client JavaScript runs, including optional NOW content.
const {createRequire}=await import('node:module');
const {readFile}=await import('node:fs/promises');
const {injectDocument}=createRequire(import.meta.url)('../server/src/lib/publicDocument.js');
const template=await readFile('dist/index.html','utf8');
const styles=JSON.parse(await readFile('server/runtime/styles.json','utf8'));
for(const content of ['', '# 当前进展']) {
 const homepage=await renderDocument('/',p=>p==='/now'?Promise.resolve({content}):p==='/posts?pageSize=4'?Promise.resolve([]):load(p));
 homepage.data.seo={title:'首页标题',canonical:'https://mooncci.site/'};
 const html=await injectDocument(template,homepage);
 const inline=html.match(/<style id="mooncci-home-css">([\s\S]*?)<\/style>/)?.[1];
 assert.equal(inline,await readFile('server/runtime/home.css','utf8'));
 for(const css of styles.index.css) assert.ok(!html.includes('rel="stylesheet" crossorigin href="'+css+'"'));
 assert.ok(html.includes('"seo":{"title":"首页标题"'));

 assert.match(html,/<html data-document-hydrating="true"/);
 assert.match(html,/首页标题/);
 for(const css of styles.MarkdownContent.css.filter(css=>!template.includes(css)))
   assert.equal(html.includes('href="'+css+'"'),Boolean(content),'Markdown CSS should follow actual NOW content');
}
console.log('Homepage acceptance: visible SSR bootstrap and conditional Markdown styles passed.');

const listing=await injectDocument(template,list);
assert.ok(!listing.includes('mooncci-home-css'));
assert.ok(listing.includes(styles.index.css[0]));

// Cover metadata must reach both SSR card and detail without client measurement.
const crop={card:{x:.25,y:.85,zoom:1.5},detail:{x:.5,y:.75,zoom:1.2}};
const framedPost={...post,cover_image:'/api/uploads/cover.png',cover_crop:crop};
const coverLoad=p=>p==='/posts/7'?Promise.resolve(framedPost):p.startsWith('/posts?')?Promise.resolve({items:[framedPost],total:1,page:1,pageSize:12}):load(p);
const framedArticle=await renderDocument('/article/7',coverLoad);
assert.deepEqual(framedArticle.data.resources['/posts/7'].cover_crop,crop);
const heroImage=JSDOM.fragment(framedArticle.html).querySelector('.hero-card img');
assert.match(heroImage.className,/cover-image--framed/);
assert.match(heroImage.getAttribute('style'),/--cover-x:50%;--cover-y:75%;--cover-zoom:1.2/);
const framedList=await renderDocument('/articles',coverLoad);
const cardImage=JSDOM.fragment(framedList.html).querySelector('.blog-card > img');
assert.ok(cardImage);assert.equal(cardImage.getAttribute('style'),null);
assert.match(cardImage.className,/card-cover-image/);
assert.match(cardImage.getAttribute('sizes'),/112px, 180px/);
assert.deepEqual(framedList.data.resources[Object.keys(framedList.data.resources).find(key=>key.startsWith('/posts?'))].items[0].cover_crop,crop);
const fullList=await renderDocument('/articles',p=>p.startsWith('/posts?')?Promise.resolve({items:[{...framedPost,cover_crop:null}],total:1,page:1,pageSize:12}):load(p));
const fullCard=JSDOM.fragment(fullList.html).querySelector('.blog-card > img');
assert.ok(fullCard);assert.equal(fullCard.getAttribute('style'),null);
assert.match(fullCard.getAttribute('sizes'),/112px, 180px/);
const oldArticle=await renderDocument('/article/7',p=>p==='/posts/7'?Promise.resolve({...framedPost,cover_crop:null}):load(p));
const oldImage=JSDOM.fragment(oldArticle.html).querySelector('.hero-card img');
assert.equal(oldImage.className,'content-image');assert.equal(oldImage.getAttribute('style'),null);
console.log('Cover SSR acceptance: all cards ignore preserved crop metadata; detail crop and legacy image markup passed.');

const work={id:1,slug:'promptdock',name:'PromptDock',stage:'building',summary:'公开作品简介',content:'## 核心功能\n\n真实作品正文。',cover_image:'',icon_image:null,repo:'13304930782/PromptDock',tech_stack:'SwiftUI',demo_url:'https://cuegroveapp.com/early-access',releases:{items:[],total:0,page:1,pageSize:20}};
const workLoad=p=>p==='/posts?pageSize=4'?Promise.resolve([]):p.startsWith('/projects/promptdock')?Promise.resolve(work):p.startsWith('/projects')?Promise.resolve({items:[work],total:1,page:1,pageSize:20}):load(p);
const workHome=JSDOM.fragment((await renderDocument('/',workLoad)).html);
assert.ok(workHome.querySelector('.project-card--compact .project-card-icon'));
assert.equal(workHome.querySelector('.project-card--compact h3').textContent,'PromptDock');
const workDetail=JSDOM.fragment((await renderDocument('/projects/promptdock',workLoad)).html);
assert.ok(workDetail.querySelector('.project-reading-body'));
assert.ok(workDetail.querySelector('.project-detail-icon'));
assert.equal(workDetail.querySelector('.project-detail-showcase'),null,'no fake product screenshot');
assert.equal(workDetail.querySelector('.project-reading-toc a').getAttribute('href'),'#project-heading-0');
assert.ok(workDetail.querySelector('#project-heading-0'));
const explicitRemoval=await renderDocument('/projects/promptdock',p=>p.startsWith('/projects/promptdock')?Promise.resolve({...work,icon_image:'',cover_image:'/api/uploads/real-shot.png'}):workLoad(p));
const removedDOM=JSDOM.fragment(explicitRemoval.html);
assert.equal(removedDOM.querySelector('.project-detail-icon'),null);
assert.equal(removedDOM.querySelector('.project-detail-showcase img').getAttribute('src'),'/api/uploads/real-shot.png');
console.log('Works SSR acceptance: compact home card, article-style detail, real showcase, TOC and explicit icon removal passed.');

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>',{url:'https://mooncci.site'});
Object.assign(global,{window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,DOMParser:dom.window.DOMParser,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle});
Object.defineProperty(global,'navigator',{value:dom.window.navigator,configurable:true});
fs.mkdirSync('.cache',{recursive:true});
require('esbuild').buildSync({entryPoints:['src/app/lib/richText.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',outfile:'.cache/rich-text-tests.cjs'});
const {isRichText,RICH_TEXT_MARKER,sanitizeRichText,richTextHasContent} = require('../.cache/rich-text-tests.cjs');
test('explicit marker distinguishes native content from legacy Markdown',()=>{
 assert.equal(isRichText('# Original\n\n<p>legacy</p>'),false);
 assert.equal(isRichText(RICH_TEXT_MARKER+'<p>new</p>'),true);
 assert.equal(richTextHasContent(RICH_TEXT_MARKER+'<p><br></p>'),false);
 assert.equal(richTextHasContent(RICH_TEXT_MARKER+'<img src="/api/uploads/a.png">'),true);
});
test('native formatting survives safe serialization',()=>{
 const result=sanitizeRichText('<h2 style="text-align:center">Title</h2><p><u>underline</u><mark style="background-color:#ffee00">highlight</mark><sup>2</sup><sub>1</sub></p><table><tbody><tr><td colspan="2">cell</td></tr></tbody></table><pre><code class="language-js">a &lt; b</code></pre>');
 assert.match(result,/text-align: center/);assert.match(result,/<u>underline/);assert.match(result,/<sup>2/);assert.match(result,/background-color/);assert.match(result,/colspan="2"/);assert.match(result,/language-js/);
 assert.equal(sanitizeRichText(result),result);
});
test('sanitizer removes active HTML, unsafe URLs and arbitrary CSS',()=>{
 const result=sanitizeRichText('<script>alert(1)</script><img src="javascript:alert(1)" onerror="evil()"><a href="javascript:evil()">bad</a><iframe src="https://example.com"></iframe><p class="overlay" style="position:fixed;background:url(https://bad);text-align:center">ok</p><input type="password" value="secret">');
 assert.doesNotMatch(result,/script|onerror|javascript|iframe|position|https:\/\/bad|password|secret|overlay/);
 assert.match(result,/disabled/);
});
test('Tiptap native document preserves rich formatting and exits a final code block',()=>{
 const {Editor}=require('@tiptap/core');const {StarterKit}=require('@tiptap/starter-kit');
 const {Image}=require('@tiptap/extension-image');const {TextAlign}=require('@tiptap/extension-text-align');
 const editor=new Editor({extensions:[StarterKit,Image,TextAlign.configure({types:['heading','paragraph']})],content:'<p style="text-align:center"><u>native</u></p><pre><code>console.log(1)</code></pre>'});
 assert.match(editor.getHTML(),/text-align: center/);assert.match(editor.getHTML(),/<u>native/);
 const end=editor.state.doc.content.size-1;editor.commands.setTextSelection(end);
 // Locate code content explicitly; trailing-node can already have inserted a paragraph.
 let position=0;editor.state.doc.descendants((node,pos)=>{if(node.type.name==='codeBlock')position=pos+1});
 editor.commands.setTextSelection(position);assert.equal(editor.commands.exitCode(),true);
 editor.commands.insertContent('正文继续');assert.match(editor.getHTML(),/<\/pre><p>正文继续/);
 editor.destroy();
});

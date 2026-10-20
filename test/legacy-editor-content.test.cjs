const {test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const dom = new JSDOM('', {url: 'https://mooncci.site'});
global.window = dom.window;
global.document = dom.window.document;
const code = require('esbuild').buildSync({
 stdin: {contents: "export {parseLegacy} from './src/app/lib/legacyEditorContent'; export {sanitizeRichText} from './src/app/lib/richText';", resolveDir: process.cwd()},
 bundle: true, platform: 'node', format: 'cjs', write: false,
}).outputFiles[0].text;
const loaded = {exports: {}};
new Function('require', 'module', 'exports', code)(require, loaded, loaded.exports);
const {parseLegacy, sanitizeRichText} = loaded.exports;
const read = source => {
 const element = document.createElement('div');
 element.innerHTML = sanitizeRichText(parseLegacy(source));
 return element;
};

test('legacy import preserves GFM formatting, task states, tables and code', () => {
 const el = read('# 标题\n\n**粗体** _斜体_ ~~删除~~\n\n> 引用\n\n- [x] 已做\n- [ ] 未做\n\n| A | B |\n| :- | -: |\n| 一 | 二 |\n\n```js\nconst a = "<img>";\n```\n\nline1  \nline2');
 assert.equal(el.querySelector('h1').textContent, '标题');
 for (const [tag, text] of [['strong','粗体'],['em','斜体'],['del','删除'],['blockquote','引用']]) assert.equal(el.querySelector(tag).textContent.trim(), text);
 assert.deepEqual([...el.querySelectorAll('input')].map(input => [input.checked, input.disabled]), [[true,true],[false,true]]);
 assert.deepEqual([...el.querySelectorAll('th,td')].map(cell => cell.textContent), ['A','B','一','二']);
 assert.equal(el.querySelector('pre code').className, 'language-js');
 assert.equal(el.querySelector('pre code').textContent, 'const a = "<img>";\n');
 assert.equal(el.querySelector('pre img'), null);
 assert.ok(el.querySelector('br'));
});

test('legacy footnote-like syntax retains ordinary reference links', () => {
 assert.equal(parseLegacy('text[^1]\n\n[^1]: note').trim(), '<p>text<a href="note">^1</a></p>');
 const el = read('[link][ref]\n\n[ref]: https://example.com "title"\n\nhttps://example.com\n\n![图](/api/uploads/a.png)');
 assert.equal(el.querySelector('a').getAttribute('title'), 'title');
 assert.equal(el.querySelectorAll('a').length, 2);
 assert.equal(el.querySelector('img').getAttribute('alt'), '图');
});

test('raw HTML remains supported only through the existing sanitizer', () => {
 const el = read('<div><u>下划线</u><script>alert(1)</script><img src="javascript:evil()" onerror="evil()"><a href="javascript:evil()">链接</a></div>');
 assert.equal(el.querySelector('u').textContent, '下划线');
 assert.equal(el.querySelector('script,[onerror],[src],[href]'), null);
 assert.doesNotMatch(el.innerHTML, /javascript:|alert\(1\)/);
});

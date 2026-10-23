const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');const dom=new JSDOM('<!doctype html><html></html>');
Object.assign(global,{window:dom.window,document:dom.window.document,Node:dom.window.Node});
const file=path.resolve('.cache/empty-headings-'+process.pid+'.mjs');fs.mkdirSync(path.dirname(file),{recursive:true});
require('esbuild').buildSync({entryPoints:['src/app/components/MarkdownContent.tsx'],bundle:true,platform:'node',format:'esm',packages:'external',loader:{'.css':'empty'},outfile:file});
let m;test.before(async()=>{m=await import(require('node:url').pathToFileURL(file).href)});test.after(()=>fs.rmSync(file,{force:true}));
test('empty native headings are omitted without renumbering later rendered anchors',()=>{
 const headings=m.headingsFor('<!--mooncci-richtext:v1--><h2>First</h2><h3><br></h3><h4>Deep</h4><h2> Last </h2>');
 assert.deepEqual(headings,[{id:'heading-0',title:'First',level:2},{id:'heading-3',title:'Last',level:2}]);
});
test('empty Markdown headings are omitted while existing line anchors remain stable',()=>{
 assert.deepEqual(m.headingsFor('## First\n\n###\n\n## Last'),[{id:'heading-0',title:'First',level:2},{id:'heading-4',title:'Last',level:2}]);
});

for (const [format, content, ids] of [
 ['Markdown', '# First\n\n## Second\n\n### Child', ['heading-0','heading-2','heading-4']],
 ['rich text', '<!--mooncci-richtext:v1--><h1>First</h1><h2>Second</h2><h3>Child</h3>', ['heading-0','heading-1','heading-2']],
]) test(`${format} article headings reserve H1 and keep TOC anchors and deeper levels`,()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const render=minHeadingLevel=>JSDOM.fragment(renderToStaticMarkup(React.createElement(m.MarkdownContent,{content,headingPrefix:'heading',minHeadingLevel})));
 const body=render(2),headings=m.headingsFor(content,2);
 assert.equal(body.querySelectorAll('h1').length,0);
 assert.deepEqual(headings.map(h=>h.level),[2,2,3]);
 assert.deepEqual(headings.map(h=>h.id),ids);
 for(const h of headings) assert.equal(body.querySelector('#'+h.id).tagName,'H'+h.level);
 assert.equal(render(undefined).querySelectorAll('h1').length,1,'other content keeps its original heading policy');
});

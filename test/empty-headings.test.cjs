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

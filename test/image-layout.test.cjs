const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><html></html>',{url:'https://mooncci.site'});
Object.assign(global,{window:dom.window,document:dom.window.document,Node:dom.window.Node});
const directory=path.resolve('.cache/image-layout-'+process.pid);
fs.mkdirSync(directory,{recursive:true});
require('esbuild').buildSync({entryPoints:['src/app/components/RichTextContent.tsx','src/app/lib/richText.ts'],bundle:true,platform:'node',format:'esm',packages:'external',loader:{'.css':'empty'},outdir:directory,outExtension:{'.js':'.mjs'}});
let renderer,sanitizer;
test.before(async()=>{renderer=await import(require('node:url').pathToFileURL(path.join(directory,'components/RichTextContent.mjs')).href);sanitizer=await import(require('node:url').pathToFileURL(path.join(directory,'lib/richText.mjs')).href)});
test.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
const parse=html=>new JSDOM(html).window.document;

test('image layout safely round-trips and rejects invalid attributes',()=>{
 const safe='<img src="/api/uploads/mod.webp" width="80" data-image-align="left" data-image-layout="heading" alt="Mod">';
 assert.equal(sanitizer.sanitizeRichText(safe),safe);
 assert.equal(sanitizer.sanitizeRichText(sanitizer.sanitizeRichText(safe)),safe);
 for(const width of ['0','31','1601','100%','80px','80.5','Infinity','1e2']){
  const image=parse(sanitizer.sanitizeRichText(`<img src="/api/uploads/a.webp" width="${width}" data-image-align="fixed" data-image-layout="evil" style="width:100vw;position:fixed" onerror="evil()">`)).querySelector('img');
  for(const name of ['width','data-image-align','data-image-layout','onerror'])assert.equal(image.hasAttribute(name),false,name+' '+width);
  assert.equal(image.style.width,'');assert.equal(image.style.position,'');
 }
 const paragraph=parse(sanitizer.sanitizeRichText('<p width="80" data-image-align="left" data-image-layout="heading">Text</p>')).querySelector('p');
 assert.equal(paragraph.attributes.length,0);
 for(const width of [32,1600])assert.equal(parse(sanitizer.sanitizeRichText(`<img src="/api/uploads/a.webp" width="${width}">`)).querySelector('img').width,width);
});

test('reading view honors display width while keeping intrinsic aspect and legacy dimensions',()=>{
 const content='<!--mooncci-richtext:v1--><img src="/api/uploads/mod.webp" width="80" data-image-align="right"><img src="/api/uploads/mod.webp">';
 const doc=parse(renderToStaticMarkup(React.createElement(renderer.RichTextContent,{content,imageDimensions:{'/api/uploads/mod.webp':{width:800,height:600}}})));
 const [small,legacy]=doc.querySelectorAll('img');
 assert.equal(small.width,80);assert.equal(small.height,60);assert.equal(small.dataset.imageAlign,'right');
 assert.equal(legacy.width,800);assert.equal(legacy.height,600);
});

test('heading icons preserve text, navigation anchors and unpaired images',()=>{
 const content='<!--mooncci-richtext:v1--><h2>Intro</h2><img src="/api/uploads/mod.webp" width="80" data-image-layout="heading">\n<h2>Anarchy</h2><p>Description</p><img src="/api/uploads/standalone.webp" data-image-layout="heading"><p>Unpaired</p><h3>Last</h3>';
 const doc=parse(renderToStaticMarkup(React.createElement(renderer.RichTextContent,{content,headingPrefix:'heading'})));
 assert.equal(doc.querySelectorAll('.rich-image-heading').length,1);
 assert.equal(doc.querySelector('.rich-image-heading h2').textContent,'Anarchy');
 assert.equal(doc.querySelector('.rich-image-heading h2').id,'heading-1');
 assert.equal(doc.querySelectorAll('img').length,2);
 assert.equal(doc.querySelector('img[src$="standalone.webp"]').parentElement.className,'markdown-body rich-text-body');
 assert.deepEqual(renderer.richTextHeadings(content),[{id:'heading-0',title:'Intro',level:2},{id:'heading-1',title:'Anarchy',level:2},{id:'heading-2',title:'Last',level:3}]);
});

test('captions are bounded image-only plaintext and cannot introduce markup',()=>{
 const payload=' <strong>caption</strong><img src=x onerror=evil()> & "caption" ';
 const image=document.createElement('img');image.src='/api/uploads/mod.webp';image.setAttribute('data-image-caption',payload);image.setAttribute('width','80');
 const sanitized=sanitizer.sanitizeRichText(image.outerHTML);
 assert.equal(parse(sanitized).querySelector('img').getAttribute('data-image-caption'),payload.trim());
 const doc=parse(renderToStaticMarkup(React.createElement(renderer.RichTextContent,{content:'<!--mooncci-richtext:v1-->'+sanitized})));
 assert.equal(doc.querySelector('figcaption').textContent,payload.trim());
 assert.equal(doc.querySelector('figcaption').children.length,0);assert.equal(doc.querySelectorAll('img').length,1);assert.equal(doc.querySelector('script'),null);
 assert.equal(doc.querySelector('figure').style.width,'80px');
 image.setAttribute('data-image-caption','<script>alert(1)</script>');
 assert.equal(parse(sanitizer.sanitizeRichText(image.outerHTML)).querySelector('img').hasAttribute('data-image-caption'),false);
 image.setAttribute('data-image-caption','x'.repeat(301));
 assert.equal(parse(sanitizer.sanitizeRichText(image.outerHTML)).querySelector('img').dataset.imageCaption.length,300);
 const paragraph=parse(sanitizer.sanitizeRichText('<p data-image-caption="caption">text</p>')).querySelector('p');
 assert.equal(paragraph.hasAttribute('data-image-caption'),false);
});

test('empty captions leave legacy images alone and captioned icons retain heading grouping',()=>{
 const content='<!--mooncci-richtext:v1--><img src="/api/uploads/empty.webp" data-image-caption="  "><img src="/api/uploads/mod.webp" width="80" data-image-layout="heading" data-image-caption="模组图标"><h2>Anarchy</h2>';
 const doc=parse(renderToStaticMarkup(React.createElement(renderer.RichTextContent,{content,headingPrefix:'heading'})));
 assert.equal(doc.querySelectorAll('figure').length,1);assert.equal(doc.querySelectorAll('img').length,2);
 assert.equal(doc.querySelector('img[src$="empty.webp"]').parentElement.className,'markdown-body rich-text-body');
 const group=doc.querySelector('.rich-image-heading');assert.equal(group.querySelector('figure').style.width,'80px');assert.equal(group.querySelector('figcaption').textContent,'模组图标');assert.equal(group.querySelector('h2').id,'heading-0');
 assert.deepEqual(renderer.richTextHeadings(content),[{id:'heading-0',title:'Anarchy',level:2}]);
});

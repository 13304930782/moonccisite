const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const dom=new JSDOM('<!doctype html>',{url:'https://mooncci.site'});
Object.assign(global,{window:dom.window,document:dom.window.document,Node:dom.window.Node,DOMParser:dom.window.DOMParser});
const directory=path.resolve('.cache/youtube-'+process.pid);fs.mkdirSync(directory,{recursive:true});
require('esbuild').buildSync({entryPoints:['src/app/lib/youtube.ts','src/app/lib/richText.ts','src/app/components/RichTextContent.tsx'],bundle:true,platform:'node',format:'esm',packages:'external',loader:{'.css':'empty'},outdir:directory,outExtension:{'.js':'.mjs'}});
let youtube,sanitizer,renderer;
test.before(async()=>{const read=p=>import(require('node:url').pathToFileURL(path.join(directory,p)).href);youtube=await read('lib/youtube.mjs');sanitizer=await read('lib/richText.mjs');renderer=await read('components/RichTextContent.mjs');});
test.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
test('YouTube URLs and iframe code extract only a fixed video ID and bounded start',()=>{
 const id='s-pZ2TzQb00';
 for(const url of [`https://youtu.be/${id}`,`https://www.youtube.com/watch?v=${id}`,`https://youtube.com/shorts/${id}`])assert.equal(youtube.youtubeVideoId(url),id);
 assert.deepEqual(youtube.parseYoutubeEmbed(`<iframe src="https://www.youtube.com/embed/${id}?si=x&amp;start=27" onload="evil()"></iframe>`),{id,start:27});
 assert.equal(youtube.parseYoutubeEmbed('<iframe src="javascript:alert(1)"></iframe>'),null);
 assert.equal(youtube.parseYoutubeEmbed(`&lt;iframe src="https://www.youtube.com/embed/${id}"&gt;&lt;/iframe&gt;`),null);
 for(const url of ['https://youtube.com.evil.test/watch?v='+id,'https://youtube.com@evil.test/watch?v='+id,'javascript:evil()','https://youtube.com/watch?v=bad','<iframe src="https://evil.test"></iframe>'])assert.equal(youtube.parseYoutubeEmbed(url),null);
 assert.equal(youtube.parseYoutubeEmbed(`https://youtu.be/${id}?start=9999999`).start,0);
 assert.equal(youtube.youtubeEmbedUrl(id,27),'https://www.youtube-nocookie.com/embed/'+id+'?playsinline=1&start=27');
});
test('saved video safely round trips; arbitrary frames stay forbidden',()=>{
 const html='<div data-youtube-id="s-pZ2TzQb00" data-youtube-start="27"><a href="https://www.youtube.com/watch?v=s-pZ2TzQb00">视频</a></div>';
 const saved=sanitizer.sanitizeRichText(html);assert.equal(sanitizer.sanitizeRichText(saved),saved);
 assert(sanitizer.richTextHasContent(sanitizer.RICH_TEXT_MARKER+'<div data-youtube-id="s-pZ2TzQb00"></div>'));
 assert(!sanitizer.sanitizeRichText('<iframe src="https://evil.test"></iframe>').includes('iframe'));
 assert(!sanitizer.sanitizeRichText('<div data-youtube-id="bad" data-youtube-start="27"></div>').includes('data-youtube'));
 const result=renderToStaticMarkup(React.createElement(renderer.RichTextContent,{content:sanitizer.RICH_TEXT_MARKER+saved}));
 const frame=new JSDOM(result).window.document.querySelector('iframe');assert(frame.src.includes('&start=27'));assert(!frame.src.includes('autoplay'));assert.equal(frame.referrerPolicy,undefined);assert.equal(frame.getAttribute('referrerpolicy'),'strict-origin-when-cross-origin');
});
test('ordinary YouTube links stay links, not players',()=>{
 const result=renderToStaticMarkup(React.createElement(renderer.RichTextContent,{content:'<p><a href="https://youtu.be/s-pZ2TzQb00">演示</a></p>'}));
 const doc=new JSDOM(result).window.document;assert.equal(doc.querySelector('a').textContent,'演示');assert.equal(doc.querySelector('iframe'),null);
});

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react'),{act,create}=require('react-test-renderer');
function component(){
 const source=ts.transpileModule(fs.readFileSync('src/app/components/ArticlePresentation.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,module={exports:{}};
 const imports={
  'react-router-dom':{Link:({to,children,...props})=>React.createElement('a',{...props,href:to},children)},
  '../lib/articleSummary':{distinctArticleSummary:s=>s},'../lib/articleAge':{isArticleOld:()=>false,stripLegacyAgeNotice:s=>s||''},'./MarkdownContent':{MarkdownContent:()=>null,headingsFor:()=>[]},'./DetailUI':{SingleLine:({children,...props})=>React.createElement('div',props,children)},'./ContentUI':{formatDate:s=>s?.slice(0,10)||''},'lucide-react':{Eye:'svg',UserRound:'svg'},'./ArticleTableOfContents':{ArticleTableOfContents:props=>React.createElement('aside',props),ReadingSettingsTrigger:props=>React.createElement('button',props,'Aa')},'../lib/coverPalette':{loadCoverGradient:()=>()=>{}},'../lib/safeUrl':{safeImageSrc:s=>s||''},'../lib/imageDimensions':{dimensionsFor:()=>({})},'./CoverImage':{CoverImage:()=>null},'./SiteBack':{SiteBack:()=>null},'../lib/coverCrop':{coverFrame:()=>({}),normalizeCoverCrop:()=>null},
 };
 new Function('exports','require','window',source)(module.exports,name=>name.endsWith('.css')?{}:imports[name]||require(name),{dispatchEvent(){}});return module.exports.ArticlePresentation;
}
const post={title:'无封面文章',content:'正文',author_name:'mooncci',published_at:'2024-11-13',updated_at:'2026-10-13'};
test('reading count arrival reuses its reserved node without inserting a metadata group or exposing a fake count',async()=>{
 const Page=component();let root;try{await act(async()=>{root=create(React.createElement(Page,{post,views:null}));});const count=root.root.findByProps({className:'article-view-count'});assert.equal(count.props['aria-hidden'],true);assert.equal(count.children[1].children.length,0);assert.equal(root.root.findAllByProps({className:'g'}).length,2);assert.match(root.root.findByType('article').props.className,/article-no-cover/);
  await act(async()=>root.update(React.createElement(Page,{post,views:12345})));assert.equal(root.root.findByProps({className:'article-view-count'}),count);assert.equal(count.props['aria-label'],'12345 次阅读');assert.equal(count.props['aria-hidden'],undefined);assert.equal(root.root.findAllByProps({className:'g'}).length,2);
 }finally{if(root)await act(async()=>root.unmount());}
});
test('editor preview has no reading-count placeholder and cover identity reaches the existing toolbar',async()=>{
 const Page=component();let root;try{await act(async()=>{root=create(React.createElement(Page,{post:{...post,cover_image:'/cover.jpg'},preview:true}));});assert.equal(root.root.findAllByProps({className:'article-view-count'}).length,0);assert.match(root.root.findByType('article').props.className,/article-has-cover/);assert.equal(root.root.findByType('aside').props.preview,true);}finally{if(root)await act(async()=>root.unmount());}
});
test('a coverless article without a directory groups the existing Aa with header actions instead of a solitary body toolbar',async()=>{
 const Page=component();let root;try{await act(async()=>{root=create(React.createElement(Page,{post}));});assert.equal(root.root.findByProps({className:'article-heading-settings'}).props.compact,true);assert.equal(root.root.findByType('aside').props.settingsInHeader,true);await act(async()=>root.update(React.createElement(Page,{post:{...post,cover_image:'/cover.jpg'}})));assert.equal(root.root.findAllByProps({className:'article-heading-settings'}).length,0);assert.equal(root.root.findByType('aside').props.settingsInHeader,false);}finally{if(root)await act(async()=>root.unmount());}
});

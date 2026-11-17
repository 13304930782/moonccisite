const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),{JSDOM}=require('jsdom');
const {fixture,translate}=require('./helpers/i18n.cjs');

test('reading tools support both route languages, translate colors, and speak the article content language',async()=>{
 const dom=new JSDOM('<button id="trigger">Reading settings</button><article data-reading-content><nav><a lang="en">English</a></nav><h1 lang="zh-CN">文章标题。</h1><p>正文。</p></article><div id="host"></div>',{url:'http://localhost/article/17',pretendToBeVisual:true});
 const saved=new Map(),spoken=[];
 const values={window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,Element:dom.window.Element,Node:dom.window.Node,CustomEvent:dom.window.CustomEvent,Event:dom.window.Event,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle.bind(dom.window),requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true};
 dom.window.matchMedia=query=>({matches:query.includes('max-width'),addEventListener(){},removeEventListener(){}});
 dom.window.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
 Object.defineProperty(dom.window,'speechSynthesis',{value:{speak:item=>spoken.push(item),cancel(){},pause(){},resume(){}}});
 values.SpeechSynthesisUtterance=dom.window.SpeechSynthesisUtterance;
 Object.defineProperty(dom.window.HTMLElement.prototype,'innerText',{get(){return this.textContent;}});
 dom.window.HTMLElement.prototype.getClientRects=()=>[{}];
 for(const [key,value]of Object.entries(values)){saved.set(key,Object.getOwnPropertyDescriptor(global,key));Object.defineProperty(global,key,{value,writable:true,configurable:true});}
 const React=require('react'),{act}=React,{createRoot}=require('react-dom/client');
 let root,location={pathname:'/article/17',search:''};
 const locale=()=>location.pathname.startsWith('/en/')?'en':'zh-CN';
 const source=ts.transpileModule(fs.readFileSync('src/app/components/ReadingTools.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 const mod={exports:{}};
 try{
  new Function('require','module','exports',source)(name=>{
   if(name==='../i18n')return {useI18n:()=>({t:(key,params)=>translate(locale(),key,params)})};
   if(name==='react-router-dom')return {useLocation:()=>location};
   if(name==='../context/ThemeContext')return {useMoonTheme:()=>({setTheme(){}})};
   if(name==='../lib/motionPreference')return {syncMotionPreference(){}};
   return name.endsWith('.css')?{}:fixture(name)||require(name);
  },mod,mod.exports);
  root=createRoot(document.getElementById('host'));
  const render=async pathname=>{
   location={pathname,search:''};
   document.documentElement.lang=locale();
   await act(async()=>root.render(React.createElement(mod.exports.default)));
  };
  const open=async()=>act(async()=>window.dispatchEvent(new CustomEvent('mooncci:reading-tools-open',{detail:{trigger:document.getElementById('trigger')}})));
  for(const [pathname,contentLang]of [['/article/17','zh-CN'],['/en/article/17','en'],['/en/article/17/','zh-CN']]){
   document.querySelector('h1').lang=contentLang;
   await render(pathname);await open();
   assert.ok(document.querySelector('[role=dialog]'),pathname);
   assert.deepEqual(Array.from(document.querySelectorAll('.rs-swatch > span:last-child'),node=>node.textContent),locale()==='en'?['Follow theme','Warm paper','Dark','High contrast']:['跟随主题','暖纸色','深色','高对比']);
   await act(async()=>document.querySelector('.rs-soft-button').click());
   assert.equal(spoken.at(-1).lang,contentLang,`${pathname} must use content language`);
   assert.equal(spoken.at(-1).text,'文章标题。');
  }
  for(const prefix of ['', '/en'])for(const route of ['/admin/posts','/login','/register','/account','/auth/callback','/forgot-password','/reset-password']){
   await render(prefix+route);await open();
   assert.equal(document.querySelector('[role=dialog]'),null,prefix+route);
   assert.equal(document.documentElement.dataset.readingColor,undefined,prefix+route);
  }
  for(const pathname of ['/articles','/en/articles','/en/article/17/comments']){
   await render(pathname);await open();
   assert.equal(document.querySelector('[role=dialog]'),null,pathname);
   assert.equal(document.documentElement.dataset.readingColor,'auto',pathname);
  }
 }finally{
  if(root)await act(async()=>root.unmount());
  await new Promise(resolve=>setTimeout(resolve,0));dom.window.close();
  for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(global,key,descriptor);else delete global[key];}
 }
});

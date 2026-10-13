const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),{JSDOM}=require('jsdom');
function loadTs(file,imports={}){
 const mod={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(id=>id.endsWith('.css')?{}:imports[id]||require(id),mod,mod.exports);return mod.exports;
}
test('reading controls apply immediately, persist under the existing key, synchronize theme and restore defaults',async()=>{
 const dom=new JSDOM('<button id="reading-trigger">阅读设置</button><div id="host"></div>',{url:'http://localhost/article/17',pretendToBeVisual:true});
 const saved=new Map(),values={window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,HTMLElement:dom.window.HTMLElement,HTMLInputElement:dom.window.HTMLInputElement,Element:dom.window.Element,Node:dom.window.Node,CustomEvent:dom.window.CustomEvent,Event:dom.window.Event,MutationObserver:dom.window.MutationObserver,getComputedStyle:dom.window.getComputedStyle.bind(dom.window),requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true};
 const matchMedia=query=>({matches:query.includes('max-width'),addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
 values.matchMedia=matchMedia;dom.window.matchMedia=matchMedia;
 for(const [key,value]of Object.entries(values)){saved.set(key,Object.getOwnPropertyDescriptor(global,key));Object.defineProperty(global,key,{value,writable:true,configurable:true});}
 const React=require('react'),{act}=React,{createRoot}=require('react-dom/client');let root;
 try{
  const theme=loadTs('src/app/context/ThemeContext.tsx');
  const motion=loadTs('src/app/lib/motionPreference.ts');
  const ReadingTools=loadTs('src/app/components/ReadingTools.tsx',{'react-router-dom':{useLocation:()=>({pathname:'/article/17',search:''})},'../context/ThemeContext':theme,'../lib/motionPreference':motion}).default;
  const mount=async()=>{root=createRoot(document.getElementById('host'));await act(async()=>root.render(React.createElement(theme.ThemeProvider,null,React.createElement(theme.ThemeToggle),React.createElement(ReadingTools))));};
  const open=async()=>act(async()=>window.dispatchEvent(new CustomEvent('mooncci:reading-tools-open',{detail:{trigger:document.getElementById('reading-trigger')}})));
  await mount();await open();
  assert.equal(document.querySelector('[role=dialog]').getAttribute('aria-modal'),'true');
  assert.equal(document.body.classList.contains('rs-open'),true);
  const slider=document.querySelector('input[type=range]');
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(slider,'20');slider.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(document.documentElement.style.getPropertyValue('--reading-size'),'20px');
  await act(async()=>document.querySelector('[role=radio][data-color=dark]').click());
  assert.equal(document.documentElement.dataset.readingColor,'dark');assert.equal(document.documentElement.dataset.moonTheme,'dark');
  assert.equal(JSON.parse(localStorage.getItem('mooncci-reading')).size,20);
  await act(async()=>root.unmount());await mount();
  assert.equal(document.documentElement.style.getPropertyValue('--reading-size'),'20px');assert.equal(document.documentElement.dataset.readingColor,'dark');
  await act(async()=>document.querySelector('.icon-button').click());
  assert.equal(document.documentElement.dataset.moonTheme,'light');assert.equal(document.documentElement.dataset.readingColor,'auto');
  await open();await act(async()=>document.querySelector('[role=switch]').click());assert.equal(document.documentElement.dataset.reducedMotion,'true');
  await act(async()=>document.querySelector('.rs-footer button').click());
  assert.equal(document.documentElement.style.getPropertyValue('--reading-size'),'');assert.equal(document.documentElement.dataset.readingColor,'auto');assert.equal(document.documentElement.dataset.reducedMotion,'false');
  assert.equal(document.querySelector('[data-color=auto]').getAttribute('aria-checked'),'true');assert.equal(document.querySelector('output').textContent,'默认');
  await act(async()=>root.unmount());
  const Link=({to,children,...props})=>React.createElement('a',{...props,href:to},children);
  const focus=loadTs('src/app/lib/focusLoop.ts');
  const Header=loadTs('src/app/components/Header.tsx',{
   'react-router-dom':{useLocation:()=>({pathname:'/article/17',search:''}),useNavigate:()=>()=>{},Link,NavLink:Link},
   '../context/ThemeContext':theme,'../lib/focusLoop':focus,'../lib/responsiveImage':{responsiveImage:src=>({src})},
   '../lib/usePublishing':{usePublishing:()=>false},'../context/AuthContext':{useAuth:()=>({user:null,logout:async()=>true,loggingOut:false,logoutError:''})},
   '../context/SiteSettingsContext':{useSiteSettings:()=>({data:{brand:{}}})},'../lib/safeUrl':{safeImageSrc:()=>''},'../lib/preloadPage':{preloadPage(){}}
  }).Header;
  root=createRoot(document.getElementById('host'));await act(async()=>root.render(React.createElement(theme.ThemeProvider,null,React.createElement(Header))));
  const menu=document.querySelector('.mobile-menu-button');await act(async()=>menu.click());await act(async()=>new Promise(resolve=>window.requestAnimationFrame(resolve)));
  assert.equal(document.body.classList.contains('menu-open'),true);assert.equal(document.activeElement.textContent,'文章');assert.equal(document.querySelector('.m-link').getAttribute('aria-current'),'page');
  assert.equal(document.querySelector('.m-login').textContent,'登录');assert.equal(document.querySelector('.mobile-theme-row'),null);
  await act(async()=>document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
  assert.equal(document.body.classList.contains('menu-open'),false);assert.equal(document.activeElement,menu);
  await act(async()=>menu.click());await act(async()=>document.querySelector('.m-backdrop').click());assert.equal(document.activeElement,menu);
 }finally{
  if(root)await act(async()=>root.unmount());await new Promise(resolve=>setTimeout(resolve,0));dom.window.close();
  for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(global,key,descriptor);else delete global[key];}
 }
});

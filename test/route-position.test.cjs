const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),{JSDOM}=require('jsdom');
function load(file,imports={}){
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','module','exports',code)(name=>imports[name]||require(name),module,module.exports);return module.exports;
}

test('POP restores after overflow content grows inside a fixed-height body and stops on user input',async()=>{
 const dom=new JSDOM('<div class="moon-app-layer"><div id="host"></div></div>',{url:'https://mooncci.site/article/101',pretendToBeVisual:true});
 const win=dom.window,saved=new Map(),observers=[];
 class ResizeObserverMock{
  constructor(callback){this.callback=callback;this.targets=[];this.disconnected=false;observers.push(this);}
  observe(target){this.targets.push(target);}
  disconnect(){this.disconnected=true;}
  resize(target){if(!this.disconnected&&this.targets.includes(target))this.callback([{target}]);}
 }
 const globals={window:win,document:win.document,history:win.history,MutationObserver:win.MutationObserver,ResizeObserver:ResizeObserverMock,IS_REACT_ACT_ENVIRONMENT:true};
 for(const [key,value]of Object.entries(globals)){saved.set(key,Object.getOwnPropertyDescriptor(global,key));Object.defineProperty(global,key,{value,writable:true,configurable:true});}
 let y=0,maxY=3000,location={key:'default',pathname:'/article/101',search:'',hash:''},navigation='POP';
 Object.defineProperty(win,'scrollY',{get:()=>y});win.scrollTo=({top})=>{y=Math.min(top,maxY);};
 const React=require('react'),{act}=React,{createRoot}=require('react-dom/client');
 const {RoutePosition}=load('src/app/components/RoutePosition.tsx',{'react-router-dom':{useLocation:()=>location,useNavigationType:()=>navigation},'../lib/siteHistory':load('src/app/lib/siteHistory.ts')});
 const root=createRoot(document.getElementById('host')),layer=document.querySelector('.moon-app-layer');
 const render=async(index,key,path,action)=>{
  location={key,pathname:path,search:'',hash:''};navigation=action;win.history.replaceState({idx:index,key},'',path);
  await act(async()=>root.render(React.createElement(RoutePosition,null,React.createElement('main',null,path))));
 };
 try{
  await render(0,'default','/article/101','POP');
  y=2081;win.dispatchEvent(new win.Event('scroll'));
  maxY=301;y=301;await render(1,'tag','/tag/React','PUSH');
  await render(0,'default','/article/101','POP');assert.equal(y,301,'Loading DOM initially clamps the saved position');
  const observer=observers.at(-1);assert(observer.targets.includes(layer),'Observe the content layer rather than the fixed-height body');
  maxY=2750;observer.resize(layer);assert.equal(y,2081,'Content resize restores the original article position');
  win.dispatchEvent(new win.Event('wheel'));y=1200;win.dispatchEvent(new win.Event('scroll'));
  observer.resize(layer);assert.equal(y,1200,'A user scroll cancels further automatic restoration');
  await render(1,'tag-again','/tag/React','PUSH');await render(0,'default','/article/101','POP');assert.equal(y,1200,'The new user position is retained');
  await act(async()=>root.unmount());assert(observers.at(-1).disconnected);
 }finally{
  await act(async()=>root.unmount());dom.window.close();
  for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(global,key,descriptor);else delete global[key];}
 }
});

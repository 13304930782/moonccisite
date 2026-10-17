const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),{JSDOM}=require('jsdom');
function load(file,imports={}){
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','module','exports',code)(name=>imports[name]||require(name),module,module.exports);return module.exports;
}

test('POP and explicit pagination anchors reuse restoration and stop on user input',async()=>{
 const dom=new JSDOM('<div class="moon-app-layer"><div id="host"></div></div>',{url:'https://mooncci.site/article/101',pretendToBeVisual:true});
 const win=dom.window,saved=new Map(),observers=[];
 class ResizeObserverMock{
  constructor(callback){this.callback=callback;this.targets=[];this.disconnected=false;observers.push(this);}
  observe(target){this.targets.push(target);this.disconnected=false;}
  disconnect(){this.disconnected=true;}
  resize(target){if(!this.disconnected&&this.targets.includes(target))this.callback([{target}]);}
 }
 const globals={window:win,document:win.document,history:win.history,MutationObserver:win.MutationObserver,ResizeObserver:ResizeObserverMock,IS_REACT_ACT_ENVIRONMENT:true};
 for(const [key,value]of Object.entries(globals)){saved.set(key,Object.getOwnPropertyDescriptor(global,key));Object.defineProperty(global,key,{value,writable:true,configurable:true});}
 let y=0,maxY=3000,location={key:'default',pathname:'/article/101',search:'',hash:''},navigation='POP';
 Object.defineProperty(win,'scrollY',{get:()=>y});win.scrollTo=({top})=>{y=Math.min(top,maxY);};
 const React=require('react'),{act}=React,{createRoot}=require('react-dom/client');
 const {RoutePosition,useRestoredPagePosition}=load('src/app/components/RoutePosition.tsx',{'react-router-dom':{useLocation:()=>location,useNavigationType:()=>navigation},'../lib/siteHistory':load('src/app/lib/siteHistory.ts'),'../lib/pageScroll':load('src/app/lib/pageScroll.ts')});
 let restored;function Probe(){restored=useRestoredPagePosition();return null;}
 const root=createRoot(document.getElementById('host')),layer=document.querySelector('.moon-app-layer');
 const render=async(index,key,path,action,state)=>{
  const url=new URL(path,win.location.href);
  location={key,pathname:url.pathname,search:url.search,hash:url.hash,state};navigation=action;win.history.replaceState({idx:index,key},'',path);
  await act(async()=>root.render(React.createElement(RoutePosition,null,React.createElement('main',null,React.createElement(Probe),path))));
 };
 try{
  await render(0,'default','/article/101','POP');
  assert.equal(restored,false,'A cold POP, including lazy children mounting after record(), is not a saved visit');
  await render(0,'default','/article/101','POP');assert.equal(restored,false,'Rerendering the same cold entry does not change its restore identity');
  y=2081;win.dispatchEvent(new win.Event('scroll'));
  maxY=301;y=301;await render(1,'tag','/tag/React','PUSH');
  await render(0,'default','/article/101','POP');assert.equal(y,301,'Loading DOM initially clamps the saved position');
  assert.equal(restored,true,'Returning even to the initial default-key entry is a known restoration');
  const observer=observers.at(-1);assert(observer.targets.includes(layer),'Observe the content layer rather than the fixed-height body');
  maxY=2750;observer.resize(layer);assert.equal(y,2081,'Content resize restores the original article position');
  win.dispatchEvent(new win.Event('wheel'));y=1200;win.dispatchEvent(new win.Event('scroll'));
  observer.resize(layer);assert.equal(y,1200,'A user scroll cancels further automatic restoration');
  await render(1,'tag-again','/tag/React','PUSH');await render(0,'default','/article/101','POP');assert.equal(y,1200,'The new user position is retained');
  const nav=document.createElement('nav');nav.className='pagination';layer.append(nav);let navDocumentTop=2000;
  nav.getBoundingClientRect=()=>({top:navDocumentTop-y});
  await render(1,'updates1','/updates','PUSH');y=1400;win.dispatchEvent(new win.Event('scroll'));
  const intent={pagination:{pathname:'/updates',index:0,top:600}};
  await render(2,'updates2','/updates?page=2','PUSH',intent);assert.equal(y,1400,'Pagination does not jump to the page heading');
  const pagingObserver=observers.at(-1);navDocumentTop=2700;pagingObserver.resize(layer);assert.equal(y,2100,'Changed list height keeps the pager at its original viewport position');
  await render(1,'updates1','/updates','POP');navDocumentTop=2000;observers.at(-1).resize(layer);assert.equal(y,1400);
  await render(2,'updates2','/updates?page=2','POP',intent);assert.equal(y,2100,'Forward uses the saved final position rather than replaying the stale paging hint');
  win.dispatchEvent(new win.Event('wheel'));y=1700;win.dispatchEvent(new win.Event('scroll'));
  await render(3,'updates3','/updates?page=3#kept','PUSH',{pagination:{pathname:'/updates',index:0,top:navDocumentTop-y}});
  const interrupted=observers.at(-1);win.dispatchEvent(new win.Event('pointerdown'));navDocumentTop=2900;interrupted.resize(layer);assert.equal(y,1700,'Another pointer action cancels the pager restoration');
  await render(4,'other','/article/102','PUSH',intent);assert.equal(y,0,'A paging hint cannot retain position on a different page');
  y=740;win.dispatchEvent(new win.Event('scroll'));
  await render(4,'filtered','/article/102?view=compact','REPLACE');assert.equal(y,740,'Lightweight replacement keeps its current viewport');
  await render(5,'message','/article/102?uid=2','PUSH',{preserveScroll:'/article/102'});assert.equal(y,740,'A same-page asynchronous detail intent can keep the still-clickable list in place');
  const admin=document.createElement('div');admin.className='admin-main';admin.innerHTML='<div class="admin-content"></div>';layer.append(admin);
  let adminY=0;Object.defineProperty(admin,'scrollTop',{get:()=>adminY,set:value=>{adminY=value;}});admin.scrollTo=({top})=>{adminY=top;};
  await render(5,'users','/admin/users?role=reader','PUSH');adminY=1900;admin.dispatchEvent(new win.Event('scroll'));
  win.history.replaceState({idx:5,key:'users'},'','/article/102');admin.dispatchEvent(new win.Event('scroll'));
  await render(6,'user','/admin/users/30','PUSH');assert.equal(adminY,0,'New admin detail starts in its own scroll container');
  await render(5,'users','/admin/users?role=reader','POP');assert.equal(adminY,1900,'Back restores the inner admin scroller');
  assert(observers.at(-1).targets.includes(admin.firstElementChild),'Observe growing admin content rather than its fixed viewport');
  win.dispatchEvent(new win.Event('touchstart'));adminY=700;admin.dispatchEvent(new win.Event('scroll'));
  observers.at(-1).resize(admin.firstElementChild);assert.equal(adminY,700,'Touch also cancels inner restoration');
  await act(async()=>root.unmount());assert(observers.at(-1).disconnected);
 }finally{
  await act(async()=>root.unmount());dom.window.close();
  for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(global,key,descriptor);else delete global[key];}
 }
});

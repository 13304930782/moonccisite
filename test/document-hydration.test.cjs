const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const {JSDOM}=require('jsdom');
const React=require('react');
const {act}=React;
const {renderToString}=require('react-dom/server');

function documentComponents(){
  const module={exports:{}};
  const source=fs.readFileSync('src/app/context/DocumentData.tsx','utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('exports','require',code)(module.exports,require);
  return module.exports;
}

test('SSR seed survives a blocked lazy route, then retires only after its hydration commit',async()=>{
  const {DocumentDataProvider,DocumentReady,useDocumentResource,useDocumentStatus,useDocumentHydration}=documentComponents();
  const h=React.createElement,seed={url:'/article/18',status:200,resources:{'/posts/18':{content:'服务器已渲染的正文'}}};
  const observations=[];
  const gates=new Set();let gateResolved=false;
  function Reader(){
    const initial=useDocumentResource('/posts/18');
    const [content]=React.useState(()=>initial.data?.content||'重新读取最新正文');
    return h('h1',null,content);
  }
  function Page({ReaderComponent,revision}){
    const gate=useDocumentHydration();gates.add(gate);
    React.useEffect(()=>{gate.then(()=>{gateResolved=true;});},[gate]);
    const [ready,setReady]=React.useState(false);
    const onReady=React.useCallback(()=>{observations.push('ready');setReady(true);},[]);
    const status=useDocumentStatus();
    return h(React.Fragment,null,h(React.Suspense,{fallback:h('p',null,'加载中')},h(ReaderComponent,{key:revision}),h(DocumentReady,{onReady})),h('output',null,`${status}:${ready}`));
  }
  const tree=(ReaderComponent,revision=0)=>h(DocumentDataProvider,{data:seed},h(Page,{ReaderComponent,revision}));
  const html=renderToString(tree(Reader));
  const dom=new JSDOM(`<div id="root">${html}</div>`,{url:'http://localhost/article/18',pretendToBeVisual:true});
  const saved=new Map();
  for(const [name,value]of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,IS_REACT_ACT_ENVIRONMENT:true})){
    saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
  }
  let root,resolveRoute;
  const lazyRoute=React.lazy(()=>new Promise(resolve=>{resolveRoute=resolve;}));
  const errors=[],host=document.getElementById('root'),original=host.querySelector('h1');
  try{
    const {hydrateRoot}=require('react-dom/client');
    await act(async()=>{root=hydrateRoot(host,tree(lazyRoute),{onRecoverableError:error=>errors.push(error.message)});});
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,30));});
    assert.equal(observations.length,0,'Readiness must wait for the lazy route, not just the provider mount');
    assert.equal(gateResolved,false,'Authentication publication must remain gated while the route is blocked');
    assert.equal(host.querySelector('h1'),original);
    assert.equal(host.querySelector('h1').textContent,'服务器已渲染的正文');
    await act(async()=>{resolveRoute({default:Reader});await Promise.resolve();});
    assert.deepEqual(errors,[]);
    assert.equal(host.querySelector('h1'),original,'Hydration must reuse the original server DOM');
    assert.equal(host.querySelector('h1').textContent,'服务器已渲染的正文');
    assert.equal(host.querySelector('output').textContent,'200:true');
    assert.equal(observations.length,1);
    assert.equal(gateResolved,true);
    assert.equal(gates.size,2,'SSR and client each create one request-local readiness promise');
    await act(async()=>{root.render(tree(lazyRoute,1));});
    assert.equal(host.querySelector('h1').textContent,'重新读取最新正文','A later mount must not reuse the initial document seed');
    assert.equal(host.querySelector('output').textContent,'200:true','Retiring resources must preserve document status');
    assert.deepEqual(errors,[]);
  }finally{
    if(root)await act(async()=>root.unmount());
    dom.window.close();for(const [name,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
  }
});

test('CSR readiness is immediately resolved without requiring DocumentReady to mount',async()=>{
  const {DocumentDataProvider,useDocumentHydration}=documentComponents();
  const {create}=require('react-test-renderer');
  let resolved=false,root;const gates=new Set();
  function Probe(){const gate=useDocumentHydration();gates.add(gate);React.useEffect(()=>{gate.then(()=>{resolved=true;});},[gate]);return null;}
  await act(async()=>{root=create(React.createElement(DocumentDataProvider,null,React.createElement(Probe)));});
  assert.equal(resolved,true);
  await act(async()=>root.update(React.createElement(DocumentDataProvider,null,React.createElement(Probe))));
  assert.equal(gates.size,1,'Readiness identity must be stable across provider renders');
  await act(async()=>root.unmount());
});

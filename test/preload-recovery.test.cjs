const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');

const entry=ts.transpileModule(fs.readFileSync('src/main.tsx','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
}).outputText;

function boot(storage) {
  const window=new EventTarget();
  let reloads=0,renders=0;
  Object.defineProperty(window,'sessionStorage',{get:()=>typeof storage==='function'?storage():storage});
  window.location={reload:()=>{reloads++}};
  const requireEntry=name=>{
    if(name==='react/jsx-runtime')return require(name);
    if(name==='react-dom/client')return{createRoot:()=>({render:()=>{renders++}}),hydrateRoot:()=>{renders++}};
    if(name.endsWith('/motionPreference'))return{installMotionPreference(){}};
    if(name.endsWith('/AppErrorBoundary'))return{AppErrorBoundary(){},StartupComplete(){}};
    if(name.endsWith('/App.tsx'))return{default(){}};
    if(name.endsWith('.css'))return{};
    throw Error('Unexpected entry dependency: '+name);
  };
  new Function('exports','require','window','document',entry)({},requireEntry,window,{
    getElementById:id=>id==='root'?{}:null,
  });
  assert.equal(renders,1,'recovery listener must preserve normal app startup');
  return{
    error(){const event=new Event('vite:preloadError',{cancelable:true});window.dispatchEvent(event);return event;},
    reloads:()=>reloads,
  };
}

test('a preload failure refreshes once and preserves subsequent errors, including after reload',()=>{
  const saved=new Map();
  const storage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)};
  const page=boot(storage);
  assert.equal(page.reloads(),0);
  assert.equal(page.error().defaultPrevented,true);
  assert.equal(page.reloads(),1);
  assert.equal(saved.size,1,'refresh marker must survive the page reload');
  assert.equal(page.error().defaultPrevented,false,'Vite must surface a second failure');
  assert.equal(page.reloads(),1);
  const reloaded=boot(storage);
  assert.equal(reloaded.error().defaultPrevented,false,'a fresh entry execution must not refresh again');
  assert.equal(reloaded.reloads(),0);
});

test('unavailable session storage leaves the preload error visible without refreshing',()=>{
  const denied=()=>{throw Error('storage denied');};
  for(const storage of [denied,{getItem:denied},{getItem:()=>null,setItem:denied}]){
    const page=boot(storage);
    assert.equal(page.error().defaultPrevented,false);
    assert.equal(page.error().defaultPrevented,false);
    assert.equal(page.reloads(),0);
  }
});

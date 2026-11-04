const {fixture:i18nFixture}=require('./helpers/i18n.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');

const handled=new WeakSet();
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
const entry=ts.transpileModule(fs.readFileSync('src/main.tsx','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
}).outputText;

async function boot(storage) {
  const window=new EventTarget();
  let reloads=0,renders=0;
  Object.defineProperty(window,'sessionStorage',{get:()=>typeof storage==='function'?storage():storage});
  window.location={pathname:'/',reload:()=>{reloads++}};
  const requireEntry=name=>{
    if(name.endsWith('/recoverableChunk'))return {isChunkErrorHandled:error=>!!error&&typeof error==='object'&&handled.has(error)};
    if(name.endsWith('/i18n'))return {ensureMessages:async()=>{}};
    if(i18nFixture(name))return i18nFixture(name);
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
  await Promise.resolve();
  assert.equal(renders,1,'recovery listener must preserve normal app startup');
  return{
    error(payload){const event=new Event('vite:preloadError',{cancelable:true});event.payload=payload;window.dispatchEvent(event);return event;},
    reloads:()=>reloads,
  };
}

test('a preload failure refreshes once and preserves subsequent errors, including after reload',async()=>{
  const saved=new Map();
  const storage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)};
  const page=await boot(storage);
  assert.equal(page.reloads(),0);
  assert.equal(page.error().defaultPrevented,false);await tick();
  assert.equal(page.reloads(),1);
  assert.equal(saved.size,1,'refresh marker must survive the page reload');
  assert.equal(page.error().defaultPrevented,false,'Vite must surface a second failure');await tick();
  assert.equal(page.reloads(),1);
  const reloaded=await boot(storage);
  assert.equal(reloaded.error().defaultPrevented,false,'a fresh entry execution must not refresh again');await tick();
  assert.equal(reloaded.reloads(),0);
});

test('unavailable session storage leaves the preload error visible without refreshing',async()=>{
  const denied=()=>{throw Error('storage denied');};
  for(const storage of [denied,{getItem:denied},{getItem:()=>null,setItem:denied}]){
    const page=await boot(storage);
    assert.equal(page.error().defaultPrevented,false);
    assert.equal(page.error().defaultPrevented,false);
    await tick();assert.equal(page.reloads(),0);
  }
});

test('a locally handled chunk error preserves the page but unrelated failures still reload once',async()=>{
  const saved=new Map();
  const page=await boot({getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)});
  const menuError=new Error('menu unavailable');
  page.error(menuError);
  await Promise.resolve();handled.add(menuError);
  await tick();assert.equal(page.reloads(),0);assert.equal(saved.size,0);
  page.error(new Error('route unavailable'));await tick();assert.equal(page.reloads(),1);
  page.error(new Error('another route'));await tick();assert.equal(page.reloads(),1);
});
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const React=require('react'),{create,act}=require('react-test-renderer'),{renderToString}=require('react-dom/server');
function fixture(inRange,off,storageDenied=false){
 const events=new EventTarget(),document=new EventTarget(),store=new Map(off?[['mooncci-halloween','off']]:[]),session=new Map(),timers=new Map();let serial=0;
 const result={range:inRange,imports:0,store,session,events,document,timers,requests:[],fail:false};
 const localStorage={getItem:key=>{if(storageDenied)throw Error('Storage disabled');return store.get(key)||null;},setItem:(key,value)=>{if(storageDenied)throw Error('Storage disabled');store.set(key,value);}};
 const sessionStorage={getItem:key=>session.get(key)||null,removeItem:key=>session.delete(key)};
 const exports={};const code=ts.transpileModule(fs.readFileSync('src/app/components/Festivals/Runtime.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('exports','require','localStorage','sessionStorage','window','document','setTimeout','clearTimeout',code)(exports,name=>{
  if(name==='./lifecycle')return {installTheme:()=>()=>{}};
  if(name==='react-router-dom')return {useLocation:()=>({pathname:result.path||'/'})};
  if(name==='../../lib/api')return {api:async(path,options)=>{result.requests.push({path,options});if(result.fail)throw Error('offline');return {active:result.range?{id:'halloween',label:'万圣节',windowLabel:'2026-10-25 — 2026-11-01',level:'major',options:{header:true,hat:true,home:true,favicon:true,pageAccent:true}}:null,serverTime:'2026-10-25T00:00:00Z',nextCheckAt:'2026-10-25T00:00:05Z'};}};
  if(name==='../Halloween/Decorations'){result.imports++;return {default:({name})=>React.createElement('decoration',{name})};}
  return require(name);
 },localStorage,sessionStorage,events,document,(callback,delay)=>{const id=++serial;timers.set(id,{callback,delay});return id;},id=>timers.delete(id));
 result.render=()=>React.createElement(React.Fragment,null,...['global','home','logo','hat','footer','page'].map(name=>React.createElement(exports.default,{key:name,name})));
 return result;
}
test('generic runtime SSR is empty; outside season never imports decoration code',async()=>{
 const f=fixture(false,false);assert.equal(renderToString(f.render()),'');assert.equal(f.requests.length,0);let root;
 try{await act(async()=>{root=create(f.render());});assert.equal(root.toJSON(),null);assert.equal(f.imports,0);assert.ok([...f.timers.values()][0].delay>0 && [...f.timers.values()][0].delay<=5000);}finally{await act(async()=>root?.unmount());}assert.equal(f.timers.size,0);
});
test('stored off loads only toggle; enable loads theme and disable unmounts all decorations',async()=>{
 const f=fixture(true,true);let root;try{await act(async()=>{root=create(f.render());});assert.equal(f.imports,0);assert.equal(root.root.findAllByType('decoration').length,0);assert.equal(root.root.findByType('button').props.children,'开启节日装饰');
 await act(async()=>root.root.findByType('button').props.onClick());assert.ok(f.imports>0);assert.equal(root.root.findAllByType('decoration').length,4);
 await act(async()=>root.root.findByType('button').props.onClick());assert.equal(f.store.get('mooncci-halloween'),'off');assert.equal(root.root.findAllByType('decoration').length,0);
 }finally{await act(async()=>root?.unmount());}
});
test('schedule and cross-tab updates re-evaluate eligibility and clean up timer/listeners',async()=>{
 const f=fixture(true,false);let root;try{await act(async()=>{root=create(f.render());});assert.equal(root.root.findAllByType('decoration').length,4);
 f.store.set('mooncci-halloween','off');const event=new Event('storage');event.key='mooncci-halloween';await act(async()=>f.events.dispatchEvent(event));assert.equal(root.root.findAllByType('decoration').length,0);
 f.range=false;await act(async()=>f.document.dispatchEvent(new Event('visibilitychange')));assert.equal(root.toJSON(),null);
 }finally{await act(async()=>root?.unmount());}assert.equal(f.timers.size,0);const requests=f.requests.length;f.events.dispatchEvent(new Event('mooncci:festivals-updated'));assert.equal(f.requests.length,requests);
});
test('all decoration style selectors scoped; no root variables',()=>{
 const text=fs.readFileSync('src/app/components/Halloween/styles.ts','utf8');assert.doesNotMatch(text,/:root/);
 for(const m of text.matchAll(/(?:^|[{}])\s*([^{}]+)\{/g)){const selector=m[1].trim();if(selector.startsWith('@')||/^(?:0%,100%|50%)$/.test(selector)||selector.startsWith('export '))continue;for(const part of selector.split(','))assert.ok(part.trim().startsWith('.halloween'),selector);}
});
test('storage denied retains session-only off preference after visibility checks',async()=>{
 const f=fixture(true,false,true);let root;try{await act(async()=>{root=create(f.render());});assert.equal(root.root.findAllByType('decoration').length,4);
 await act(async()=>root.root.findByType('button').props.onClick());assert.equal(root.root.findAllByType('decoration').length,0);
 await act(async()=>f.document.dispatchEvent(new Event('visibilitychange')));assert.equal(root.root.findAllByType('decoration').length,0);assert.equal(root.root.findByType('button').props.children,'开启节日装饰');
 }finally{await act(async()=>root?.unmount());}
});
test('failed configuration disables decorations without throwing and retry is scheduled',async()=>{
 const f=fixture(true,false);f.fail=true;let root;try{await act(async()=>{root=create(f.render());});assert.equal(root.toJSON(),null);assert.equal(f.imports,0);assert.equal(f.timers.size,1);f.fail=false;await act(async()=>f.events.dispatchEvent(new Event('mooncci:festivals-updated')));assert.equal(root.root.findAllByType('decoration').length,4);}finally{await act(async()=>root?.unmount());}
});
test('private preview requires POST and never changes local preference or public endpoint',async()=>{
 const f=fixture(true,false);f.session.set('mooncci-festival-preview',JSON.stringify({festivalId:'halloween',at:'2026-10-31T00:00:00+08:00',expiresAt:Date.now()+100000}));let root;
 try{await act(async()=>{root=create(f.render());});assert.equal(f.requests[0].path,'/settings/festivals/preview');assert.equal(f.requests[0].options.method,'POST');assert.equal(f.requests[0].options.cache,'no-store');assert.equal(f.store.size,0);assert.equal(root.root.findByType('aside').props['aria-label'],'节日预览');await act(async()=>root.root.findAllByType('button')[0].props.onClick());assert.equal(f.session.size,0);assert.equal(f.requests.at(-1).path,'/settings/festivals/active');}finally{await act(async()=>root?.unmount());}
});
test('theme lifecycle restores favicon/style/class and stops module interactions on removal',async()=>{
 const {JSDOM}=require('jsdom');const dom=new JSDOM('<html><head><link rel="icon" href="/original.svg"></head><body><p>正文</p></body></html>');
 const exports={},code=ts.transpileModule(fs.readFileSync('src/app/components/Festivals/lifecycle.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('exports','require','document','MutationObserver',code)(exports,()=>({reducedMotion:()=>true}),dom.window.document,dom.window.MutationObserver);
 let disposed=0;const doc=dom.window.document;
 const remove=exports.installTheme({className:'halloween',styles:'.halloween .decor{color:orange}',faviconSvg:'pumpkin',dispose:()=>disposed++},true);
 assert.equal(doc.documentElement.classList.contains('halloween'),true);assert.equal(doc.querySelectorAll('style').length,1);
 assert.equal(doc.querySelector('link').getAttribute('href'),'data:image/svg+xml,pumpkin');
 doc.querySelector('link').setAttribute('href','/updated.svg');await new Promise(resolve=>setImmediate(resolve));assert.equal(doc.querySelector('link').getAttribute('href'),'data:image/svg+xml,pumpkin');
 remove();assert.equal(doc.querySelector('link').getAttribute('href'),'/updated.svg');assert.equal(doc.querySelectorAll('style').length,0);assert.equal(doc.documentElement.classList.contains('halloween'),false);assert.equal(disposed,1);assert.equal(doc.querySelector('p').textContent,'正文');
 doc.querySelector('link').setAttribute('href','/after.svg');await new Promise(resolve=>setImmediate(resolve));assert.equal(doc.querySelector('link').getAttribute('href'),'/after.svg');dom.window.close();
});
test('shared motion observer honors reading preference, visibility, and removes listeners on unmount',()=>{
 const events=new EventTarget(),doc=new EventTarget(),media=new EventTarget(),changes=[];let callback,disconnected=false,reduced=false;
 const exports={},code=ts.transpileModule(fs.readFileSync('src/app/components/Festivals/lifecycle.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('exports','require','document','window','matchMedia','IntersectionObserver',code)(exports,()=>({reducedMotion:()=>reduced}),doc,events,()=>media,class {constructor(cb){callback=cb;}observe(){}disconnect(){disconnected=true;}});
 const remove=exports.observeMotion({},value=>changes.push(value));callback([{isIntersecting:true}]);assert.equal(changes.at(-1),true);
 reduced=true;events.dispatchEvent(new Event('mooncci:motion-change'));assert.equal(changes.at(-1),false);
 reduced=false;media.dispatchEvent(new Event('change'));assert.equal(changes.at(-1),true);
 doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(changes.at(-1),false);
 remove();assert.equal(disconnected,true);const count=changes.length;events.dispatchEvent(new Event('mooncci:motion-change'));media.dispatchEvent(new Event('change'));doc.dispatchEvent(new Event('visibilitychange'));assert.equal(changes.length,count);
});

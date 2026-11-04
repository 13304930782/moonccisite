const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react'),{act,create}=require('react-test-renderer');
const {fixture}=require('./helpers/i18n.cjs');
function load(file,imports){const box={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('exports','require',code)(box.exports,name=>imports[name]||fixture(name)||require(name));return box.exports;}
test('successful translation writes invalidate public snapshots and site translations notify active settings; failures do neither',async()=>{
 const previous={window:global.window,fetch:global.fetch};global.window=new EventTarget();let cleared=0,events=0,fail=false;window.addEventListener('site-settings-updated',()=>events++);
 global.fetch=async()=>Response.json(fail?{message:'Conflict'}:{ok:true},{status:fail?409:200});
 const {api}=load('src/app/lib/api.ts',{'./publicSnapshots':{clearPublicSnapshots:()=>cleared++},'./browserDiagnostics':{beginApiDiagnostic:()=>null}});
 try{await api('/settings/translations/blog_pages/1',{method:'PUT',body:'{}'});assert.equal(cleared,1);assert.equal(events,0);await api('/settings/translations/site/1',{method:'PUT',body:'{}'});assert.equal(cleared,2);assert.equal(events,1);fail=true;await assert.rejects(()=>api('/settings/translations/site/1',{method:'PUT',body:'{}'}));assert.equal(cleared,2);assert.equal(events,1);}finally{Object.assign(global,previous);}
});
test('site invalidation clears both locale session snapshots and late reads cannot restore old settings',async()=>{
 const previous={window:global.window,sessionStorage:global.sessionStorage};global.window=new EventTarget();const saved=new Map(['zh-CN','en'].map(locale=>['mooncci-public-settings-v1:'+locale,JSON.stringify({time:Date.now(),data:{brand:{name:'Old'},hero:{},footer:{}}})]));global.sessionStorage={getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value),removeItem:key=>saved.delete(key)};
 const requests=[];const api=(_path,options)=>new Promise(resolve=>requests.push({resolve,options}));
 const component=load('src/app/context/SiteSettingsContext.tsx',{'../lib/api':{api},'./DocumentData':{useDocumentResource:()=>({})}});let tree;
 function Probe(){return React.createElement('output',null,component.useSiteSettings().data?.brand.name);}
 try{await act(async()=>{tree=create(React.createElement(component.SiteSettingsProvider,null,React.createElement(Probe)));});await act(async()=>{window.dispatchEvent(new Event('site-settings-updated'));requests[0].resolve({brand:{name:'Stale'},hero:{},footer:{}});});assert.equal(saved.size,0);assert.equal(requests[0].options.signal.aborted,true);await act(async()=>requests[1].resolve({brand:{name:'Fresh'},hero:{},footer:{}}));assert.equal(tree.root.findByType('output').children.join(''),'Fresh');assert.equal(saved.has('mooncci-public-settings-v1:en'),false);}finally{if(tree)await act(async()=>tree.unmount());Object.assign(global,previous);}
});

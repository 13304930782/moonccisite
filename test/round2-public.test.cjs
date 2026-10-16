const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
function fixture(){
 const requests=[];let result,root;
 const imports={
  '../context/DocumentData':{useDocumentResource:()=>({})},
  '../lib/publicSnapshots':{readSnapshot:()=>null,writeSnapshot(){},snapshotGeneration:()=>0,deleteSnapshot(){},subscribeSnapshotInvalidation:()=>()=>{}},
  '../lib/publicRead':{publicReadPath:path=>/^\/(posts|activity|projects)(\?|$)/.test(path),publicRead:(path,signal)=>new Promise((resolve,reject)=>requests.push({path,signal,resolve,reject}))},
  '../lib/feedback':{},'../lib/api':{},'../lib/browserDiagnostics':{},
  './Header':{},'./SiteFooter':{},'./SiteBack':{},'react-router-dom':{},
 };
 const code=ts.transpileModule(fs.readFileSync('src/app/components/ContentUI.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,module={exports:{}};
 new Function('module','exports','require',code)(module,module.exports,name=>Object.hasOwn(imports,name)?imports[name]:require(name));
 function Probe(props){result=module.exports.useResource(props.path,true,{keepPrevious:props.keep});return null;}
 return{requests,get result(){return result;},render:async(path,keep)=>act(async()=>{const element=React.createElement(Probe,{path,keep});root?root.update(element):root=create(element);}),close:async()=>act(async()=>root.unmount())};
}
test('public list refresh preserves the previous data while the newest request wins',async()=>{
 const f=fixture();try{
  await f.render('/posts?page=1',true);await act(async()=>f.requests[0].resolve({items:['first']}));
  await f.render('/posts?page=2',true);assert.deepEqual(f.result.data,{items:['first']});assert.equal(f.result.loading,true);
  await f.render('/posts?page=3',true);assert.equal(f.requests[1].signal.aborted,true);
  await act(async()=>f.requests[2].resolve({items:['latest']}));await act(async()=>f.requests[1].resolve({items:['stale']}));
  assert.deepEqual(f.result.data,{items:['latest']});assert.equal(f.result.loading,false);
 }finally{await f.close();}
});
test('refresh failure retains content, explicit retry replaces it and empty results are real',async()=>{
 const f=fixture();try{
  await f.render('/activity?type=post',true);await act(async()=>f.requests[0].resolve({items:['post']}));
  await f.render('/activity?type=update',true);await act(async()=>f.requests[1].reject(Error('offline')));
  assert.deepEqual(f.result.data,{items:['post']});assert.equal(f.result.error,'offline');
  await act(async()=>f.result.reload());assert.equal(f.result.loading,true);await act(async()=>f.requests[2].resolve({items:[]}));
  assert.deepEqual(f.result.data,{items:[]});assert.equal(f.result.error,'');
 }finally{await f.close();}
});
test('private resources and detail pages never opt into public list retention',async()=>{
 const f=fixture();try{
  await f.render('/account/1',true);await act(async()=>f.requests[0].resolve({secret:1}));
  await f.render('/account/2',true);assert.equal(f.result.data,null);
  await f.render('/posts/1',false);await act(async()=>f.requests[2].resolve({id:1}));
  await f.render('/posts/2',false);assert.equal(f.result.data,null);
 }finally{await f.close();}
});
test('permission failures clear retained public content instead of showing stale protected data',async()=>{
 const f=fixture();try{
  await f.render('/posts?page=1',true);await act(async()=>f.requests[0].resolve({items:['old']}));
  await f.render('/posts?page=2',true);await act(async()=>f.requests[1].reject(Object.assign(Error('denied'),{status:403})));
  assert.equal(f.result.data,null);assert.equal(f.result.errorStatus,403);
 }finally{await f.close();}
});
test('retained article rows never leave pagination stuck on the old page while pending or failed',async()=>{
 let status={data:{items:[],page:1,total:40,pageSize:12},loading:true,error:''},seen,root;const params=new URLSearchParams('page=2');
 const imports={'react-router-dom':{useSearchParams:()=>[params,()=>{}]},'./BlogCard':{BlogCard:()=>null},'./ContentUI':{useResource:()=>status,ResourceState:({children})=>children,Pagination:({data})=>{seen=data;return null;}},'../lib/feedbackMotion':{feedbackMotion:()=>()=>{}},'../lib/motionDesign':{motionDesign:{content:{duration:.22}}}};
 const code=ts.transpileModule(fs.readFileSync('src/app/components/PostResults.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,module={exports:{}};
 new Function('module','exports','require',code)(module,module.exports,name=>imports[name]||require(name));
 try{await act(async()=>{root=create(React.createElement(module.exports.PostResults,{path:'/posts'}));});assert.equal(seen.page,2);
  await act(async()=>{status={...status,loading:false,error:'offline'};root.update(React.createElement(module.exports.PostResults,{path:'/posts'}));});assert.equal(seen.page,2);
  await act(async()=>{status={...status,loading:false,error:''};root.update(React.createElement(module.exports.PostResults,{path:'/posts'}));});assert.equal(seen.page,1,'Accepted server pagination remains authoritative');
 }finally{await act(async()=>root?.unmount());}
});

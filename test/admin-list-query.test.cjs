const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
async function fixture(initial,defaults={},pageKey='page',resource=false){
 let current,root,params=new URLSearchParams(initial);const changes=[],reads=[],anchors=[];
 const location={pathname:'/admin/fixture',state:{context:'retained'}};
 const setter=(value,options)=>{params=new URLSearchParams(typeof value==='function'?value(params):value);changes.push({query:params.toString(),options});rerender();};
 const modules={react:React,'react-router-dom':{useLocation:()=>location},'./usePageSearchParams':{usePageSearchParams:()=>[params,setter]},'./pageScroll':{paginationSelector:'nav.pagination',paginationState:(nav,path,state)=>{anchors.push(nav);return nav?{...state,pagination:{pathname:path}}:state;}},'./api':{api:async path=>{reads.push(path);return{items:[],total:70,page:2};}}};
 const m={exports:{}},code=ts.transpileModule(fs.readFileSync('src/app/lib/useAdminList.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('module','exports','require',code)(m,m.exports,name=>modules[name]||require(name));
 const saved=Object.getOwnPropertyDescriptor(global,'document');global.document={activeElement:{closest:()=>({id:'real-user-pager'})}};
 function View(){current=resource?m.exports.useAdminList('/admin/fixture',defaults):m.exports.useAdminListQuery(defaults,pageKey);return null;}
 const rerender=()=>root?.update(React.createElement(View));
 await act(async()=>{root=create(React.createElement(View));});
 return{get current(){return current;},get params(){return params;},changes,reads,anchors,close:async()=>{await act(async()=>root.unmount());saved?Object.defineProperty(global,'document',saved):delete global.document;}};
}
test('light list filters replace atomically and preserve unrelated URL parameters',async()=>{
 const f=await fixture('status=published&page=3&keep=original',{status:'all',keyword:''});try{
 assert.equal(f.current.page,3);assert.equal(f.current.filters.status,'published');
 await act(async()=>f.current.changeParams({status:'draft',page:''}));
 assert.equal(f.params.get('status'),'draft');assert.equal(f.params.get('keep'),'original');assert.equal(f.params.has('page'),false);assert.equal(f.changes.at(-1).options.replace,true);
 await act(async()=>f.current.changeParams({status:'all'}));assert.equal(f.params.has('status'),false);
 }finally{await f.close();}
});
test('user pagination pushes, forwards exact shared pagination options and supports independent page keys',async()=>{
 const f=await fixture('page=4&subscriberPage=2&keep=1',{},'subscriberPage');try{
 const target={closest:()=>({id:'clicked-pager'})};await act(async()=>f.current.setPage(p=>p+1,f.current.pageOptions(target)));assert.equal(f.params.get('page'),'4');assert.equal(f.params.get('subscriberPage'),'3');assert.notEqual(f.changes.at(-1).options.replace,true);assert.equal(f.changes.at(-1).options.state.pagination.pathname,'/admin/fixture');assert.equal(f.anchors[0].id,'clicked-pager');
 const options={state:{pagination:{pathname:'/admin/fixture',index:1,top:400}}};await act(async()=>f.current.setPage(4,options));assert.equal(f.changes.at(-1).options,options);
 assert.equal(f.params.get('keep'),'1');
 }finally{await f.close();}
});
test('automatic page correction replaces without capturing an old user pagination anchor',async()=>{
 const f=await fixture('page=999&status=all&keep=1',{status:'all'},'page',true);try{
 assert.equal(f.current.page,2);assert.equal(f.params.get('keep'),'1');assert.equal(f.changes.length,1);assert.equal(f.changes[0].options.replace,true);assert.equal(f.changes[0].options.state,undefined);assert.deepEqual(f.anchors,[]);
 assert(f.reads.every(path=>!path.includes('keep=')),'unrelated URL parameters never leak into the list API');
 }finally{await f.close();}
});

const React=require('react'),fs=require('node:fs'),ts=require('typescript');

// Run the real list-query hook while keeping these component unit tests router-free.
module.exports=function listFixture(api=async()=>({items:[],total:0,page:1})){
 const module={exports:{}},code=ts.transpileModule(fs.readFileSync('src/app/lib/useAdminList.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const imports={react:React,'react-router-dom':{useLocation:()=>({pathname:'/admin/fixture',state:null})},'./api':{api},'./pageScroll':{paginationSelector:'nav',paginationState:(_nav,_path,state)=>state},'./usePageSearchParams':{usePageSearchParams(){
  const [params,setParams]=React.useState(()=>new URLSearchParams());
  const update=React.useCallback(value=>setParams(current=>new URLSearchParams(typeof value==='function'?value(current):value)),[]);
  return[params,update];
 }}};
 new Function('exports','require','document',code)(module.exports,name=>imports[name]||require(name),{activeElement:null});
 return module.exports;
};

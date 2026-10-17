const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react'),{act,create}=require('react-test-renderer');
test('ordinary pagination carries its viewport anchor through the existing callback; modified clicks stay native',async()=>{
 const location={pathname:'/updates',search:'?type=post',hash:'#kept',state:{context:'kept'}},calls=[],nav={getBoundingClientRect:()=>({top:612}),ownerDocument:{querySelectorAll:()=>[{},nav]}};
 const imports={'react-router-dom':{Link:({to,...props})=>React.createElement('a',{href:to,...props}),useLocation:()=>location}};
 for(const name of['../context/DocumentData','../lib/publicSnapshots','../lib/feedback','../lib/api','../lib/publicRead','./Header','./SiteFooter','./SiteBack','../lib/browserDiagnostics'])imports[name]={};
 const scroll={exports:{}};new Function('exports',ts.transpileModule(fs.readFileSync('src/app/lib/pageScroll.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(scroll.exports);imports['../lib/pageScroll']=scroll.exports;
 const module={exports:{}},code=ts.transpileModule(fs.readFileSync('src/app/components/ContentUI.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('exports','require',code)(module.exports,name=>imports[name]||require(name));let root;try{
  await act(async()=>{root=create(React.createElement(module.exports.Pagination,{data:{items:[],total:30,page:1,pageSize:10},onPage:(...args)=>calls.push(args)}));});
  const next=root.root.findByType('a');assert.equal(next.props.href,'/updates?type=post&page=2#kept');let prevented=0;
  const event={button:0,ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,currentTarget:{closest:()=>nav},preventDefault(){prevented++;}};
  next.props.onClick({...event,ctrlKey:true});assert.equal(calls.length,0);assert.equal(prevented,0);
  next.props.onClick(event);assert.equal(prevented,1);assert.deepEqual(calls,[[2,{state:{context:'kept',pagination:{pathname:'/updates',index:1,top:612}}}]]);
 }finally{if(root)await act(async()=>root.unmount());}
});

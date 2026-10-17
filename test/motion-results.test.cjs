const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react'),{act,create}=require('react-test-renderer');
test('result handoff only presents added or changed rows and cancels it on the next refresh',async()=>{
 let data={items:[],total:0},loading=false,rows=[],root,cancels=0;const calls=[];
 const code=ts.transpileModule(fs.readFileSync('src/app/components/PostResults.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,exports={};
 new Function('exports','require',code)(exports,name=>({
  'react-router-dom':{},'../lib/usePageSearchParams':{usePageSearchParams:()=>[new URLSearchParams(),()=>{}]},
  './ContentUI':{useResource:()=>({data,loading}),ResourceState:({children})=>children,Pagination:()=>null},'./BlogCard':{BlogCard:()=>null},
  '../lib/feedbackMotion':{feedbackMotion:(node,frames)=>{calls.push({node,frames});return()=>cancels++;}},'../lib/motionDesign':{motionDesign:{content:{duration:.22}}},
 }[name]||require(name)));
 const Component=exports.PostResults,node=(href,text)=>({getAttribute:()=>href,textContent:text});
 const first=node('/article/1','one'),second=node('/article/2','two');rows=[first,second];
 const render=()=>React.createElement(Component,{path:'/posts'});
 try{
  await act(async()=>{root=create(render(),{createNodeMock:element=>element.props.className==='post-grid'?{querySelectorAll:()=>rows}:null});});assert.equal(calls.length,0);
  const added=node('/article/3','three');rows=[first,added];data={items:[],total:2};await act(async()=>root.update(render()));assert.deepEqual(calls.map(c=>c.node),[added]);
  loading=true;await act(async()=>root.update(render()));assert.equal(cancels,1);assert.equal(calls.length,1);
  loading=false;const changed=node('/article/1','one updated');rows=[changed,added];data={items:[],total:2};await act(async()=>root.update(render()));assert.deepEqual(calls.map(c=>c.node),[added,changed]);
 }finally{if(root)await act(async()=>root.unmount());}
});

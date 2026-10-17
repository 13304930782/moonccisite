const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),{act,create}=require('react-test-renderer'),fs=require('node:fs'),ts=require('typescript');
test('update results commit as an unclipped batch; only new or changed identities animate together',async()=>{
 const calls=[],stops=[],box=({children})=>React.createElement('div',null,children),imports={
  '../lib/feedback':{},'../components/SiteBack':{},'../lib/feedbackMotion':{feedbackMotion:(element,keyframes,duration)=>{calls.push({element,keyframes,duration});return()=>stops.push(element);}},
  '../lib/useMovingIndicator':{useMovingIndicator(){}},'../components/MotionDisclosure':{MotionDisclosure:box},'../lib/motionDesign':{motionDesign:{content:{duration:.22}}},
  '../lib/usePageSearchParams':{},
  'react-router-dom':{Link:'a'},'lucide-react':{MessageCircle:'svg',FileText:'svg',GitBranch:'svg'},'../../styles/update-journal.css':{},'../components/CommentSection':{},
  '../components/ContentUI':{formatDate:()=> '2026/10/16'},'../components/MarkdownContent':{},'../lib/safeUrl':{},
 };
 const module={exports:{}},code=ts.transpileModule(fs.readFileSync('src/app/pages/UpdatesPage.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('module','exports','require',code+'\nexports.TestTimeline=UpdateTimeline;')(module,module.exports,name=>Object.hasOwn(imports,name)?imports[name]:require(name));
 const Component=module.exports.TestTimeline,item=(id,title=id)=>({activity_id:id,id:1,title,excerpt:'same excerpt',published_at:'2026-10-16',type:'post',path:'/article/1'}),shared={dataset:{activityId:'shared'}},old={dataset:{activityId:'old'}},fresh={dataset:{activityId:'fresh'}},second={dataset:{activityId:'second'}};
 let rows=[shared,old],root;const feed={querySelectorAll:()=>rows};
 try{await act(async()=>{root=create(React.createElement(Component,{items:[item('shared'),item('old')]}),{createNodeMock:node=>node.props.className==='journal-feed'?feed:{}});});assert.equal(calls.length,0,'SSR or first load must not dim already visible rows');assert.equal(root.toJSON().props.className,'journal-feed','the result list has no height-reveal wrapper that serially exposes rows');const before=root.root.findAll(node=>node.props['data-activity-id']==='shared')[0];
  rows=[shared,fresh,second];await act(async()=>root.update(React.createElement(Component,{items:[item('shared'),item('fresh'),item('second')]})));assert.deepEqual(calls.map(c=>c.element),[fresh,second],'all new rows begin in the same result commit without a timer or stagger');assert.equal(root.root.findAll(node=>node.props['data-activity-id']==='shared')[0],before);
  rows=[fresh,shared];await act(async()=>root.update(React.createElement(Component,{items:[item('fresh'),item('shared')]})));assert.equal(calls.length,2,'unchanged rows do not replay on reorder/refetch');assert.equal(stops.length,2);
  await act(async()=>root.update(React.createElement(Component,{items:[item('fresh'),item('shared','updated title')]})));assert.equal(calls.length,3);assert.equal(calls[2].element,shared);assert.equal(calls[2].duration,.22);
 }finally{await act(async()=>root?.unmount());}
});
test('update pagination preserves unrelated parameters and forwards the intent; distinct type changes replace page one',async()=>{
 const navigations=[],box=({children})=>React.createElement('div',null,children);let params=new URLSearchParams('type=post&page=2&from=home'),pagination;
 const read=()=>[params,(next,options)=>{const result=typeof next==='function'?next(params):new URLSearchParams(next);if(result.toString()===params.toString())return;params=result;navigations.push([Object.fromEntries(result),options]);}];
 const imports={
  '../lib/feedback':{},'../components/SiteBack':{},'../lib/feedbackMotion':{feedbackMotion:()=>()=>{}},'../lib/useMovingIndicator':{useMovingIndicator(){}},'../components/MotionDisclosure':{MotionDisclosure:box},'../lib/motionDesign':{motionDesign:{content:{duration:.22}}},
  'react-router-dom':{Link:'a',useSearchParams:read},'../lib/usePageSearchParams':{usePageSearchParams:read},'lucide-react':{MessageCircle:'svg',FileText:'svg',GitBranch:'svg'},'../../styles/update-journal.css':{},'../components/CommentSection':{},
  '../components/ContentUI':{SitePage:box,PageHeading:box,ResourceState:box,Pagination:props=>{pagination=props;return null;},useResource:()=>({data:{items:[],page:2,total:18,pageSize:6},loading:false}),formatDate:()=> '2026/10/16'},'../components/MarkdownContent':{},'../lib/safeUrl':{},
 };
 const module={exports:{}},code=ts.transpileModule(fs.readFileSync('src/app/pages/UpdatesPage.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('module','exports','require',code)(module,module.exports,name=>Object.hasOwn(imports,name)?imports[name]:require(name));let root;
 try{await act(async()=>{root=create(React.createElement(module.exports.default),{createNodeMock:()=>({querySelectorAll:()=>[]})});});const options={state:{pagination:{pathname:'/updates',top:520,index:0}}};pagination.onPage(3,options);assert.deepEqual(navigations[0],[{type:'post',page:'3',from:'home'},options]);assert.equal(navigations[0][1],options,'the page must forward the existing navigation intent rather than build another scroll controller');
  root.root.findAllByType('button').find(button=>button.props.children==='文章').props.onClick();assert.equal(navigations.length,1,'reselecting the active type does not reset pagination or add history');
  const type=root.root.findAllByType('button').find(button=>button.props.children==='近况');type.props.onClick();assert.deepEqual(navigations[1],[{type:'update',from:'home'},{replace:true}],'type selection clears only page and uses replace without pagination preservation state');
  root.root.findAllByType('button').find(button=>button.props.children==='文章').props.onClick();assert.deepEqual(navigations[2],[{type:'post',from:'home'},{replace:true}],'a rapid reverse uses the latest setter value rather than the previous render');
 }finally{await act(async()=>root?.unmount());}
});

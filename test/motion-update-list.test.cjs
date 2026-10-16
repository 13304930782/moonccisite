const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),{act,create}=require('react-test-renderer'),fs=require('node:fs'),ts=require('typescript');
test('update rows do not replay their initial content; only new or changed identities animate',async()=>{
 const calls=[],stops=[],box=({children})=>React.createElement('div',null,children),imports={
  '../lib/feedback':{},'../components/SiteBack':{},'../lib/feedbackMotion':{feedbackMotion:(element,keyframes,duration)=>{calls.push({element,keyframes,duration});return()=>stops.push(element);}},
  '../lib/useMovingIndicator':{useMovingIndicator(){}},'../components/MotionDisclosure':{MotionDisclosure:box},'../lib/motionDesign':{motionDesign:{content:{duration:.22}}},
  'react-router-dom':{Link:'a'},'lucide-react':{MessageCircle:'svg',FileText:'svg',GitBranch:'svg'},'../../styles/update-journal.css':{},'../components/CommentSection':{},
  '../components/ContentUI':{formatDate:()=> '2026/10/16'},'../components/MarkdownContent':{},'../lib/safeUrl':{},
 };
 const module={exports:{}},code=ts.transpileModule(fs.readFileSync('src/app/pages/UpdatesPage.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('module','exports','require',code+'\nexports.TestTimeline=UpdateTimeline;')(module,module.exports,name=>Object.hasOwn(imports,name)?imports[name]:require(name));
 const Component=module.exports.TestTimeline,item=(id,title=id)=>({activity_id:id,id:1,title,excerpt:'same excerpt',published_at:'2026-10-16',type:'post',path:'/article/1'}),shared={dataset:{activityId:'shared'}},old={dataset:{activityId:'old'}},fresh={dataset:{activityId:'fresh'}};
 let rows=[shared,old],root;const feed={querySelectorAll:()=>rows};
 try{await act(async()=>{root=create(React.createElement(Component,{items:[item('shared'),item('old')]}),{createNodeMock:node=>node.props.className==='journal-feed'?feed:{}});});assert.equal(calls.length,0,'SSR or first load must not dim already visible rows');const before=root.root.findAll(node=>node.props['data-activity-id']==='shared')[0];
  rows=[shared,fresh];await act(async()=>root.update(React.createElement(Component,{items:[item('shared'),item('fresh')]})));assert.equal(calls.length,1);assert.equal(calls[0].element,fresh);assert.equal(root.root.findAll(node=>node.props['data-activity-id']==='shared')[0],before);
  rows=[fresh,shared];await act(async()=>root.update(React.createElement(Component,{items:[item('fresh'),item('shared')]})));assert.equal(calls.length,1,'unchanged rows do not replay on reorder/refetch');assert.equal(stops.length,1);
  await act(async()=>root.update(React.createElement(Component,{items:[item('fresh'),item('shared','updated title')]})));assert.equal(calls.length,2);assert.equal(calls[1].element,shared);assert.equal(calls[1].duration,.22);
 }finally{await act(async()=>root?.unmount());}
});

const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs');
const React=require('react'),{act,create}=require('react-test-renderer');

test('review dismissal retains manuscript during exit, blocks closing actions and opens the next draft',async()=>{
 const module={exports:{}},writes=[];
 const drafts=[{draft_id:1,title:'第一稿',author_name:'作者一',draft_version:3,state:'submitted',snapshot:{content:'第一稿正文'}},{draft_id:2,title:'第二稿',author_name:'作者二',draft_version:4,state:'submitted',snapshot:{content:'第二稿正文'}}];
 // Keep children mounted after open=false, as Radix Presence does while fading out.
 const Dialog=props=>React.createElement('dialog-shell',props,props.children);
 const mocks={
  'react-router-dom':{useSearchParams:()=>[new URLSearchParams()]},
  'lucide-react':{Inbox:'svg',FileText:'svg',ArrowRight:'svg',CalendarClock:'svg'},
  '../lib/feedback':{notify:{error(){}}},
  '../lib/api':{api:async(path,options)=>{if(options){writes.push(path);return {}}return {total:drafts.length,items:drafts}}},
  '../lib/safeUrl':{safeImageSrc:()=>''},
  '../components/MarkdownContent':{MarkdownContent:({content})=>React.createElement('div',null,content)},
  '../components/ThemeSelect':{ThemeSelect:props=>React.createElement('select',props,props.children)},
  '../components/ui/dialog':{Dialog,DialogContent:'dialog-content',DialogTitle:'h2',DialogDescription:'p'},
  './SubmissionsPage':{workflowNames:{submitted:'待审核'}},
 };
 const code=ts.transpileModule(fs.readFileSync('src/app/pages/PublishingQueuePage.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('exports','require',code)(module.exports,name=>name.endsWith('.css')?{}:mocks[name]||require(name));
 let root;
 try{
  await act(async()=>{root=create(React.createElement(module.exports.default));});
  const open=index=>root.root.findAllByType('button').filter(b=>b.children.includes('查看并处理'))[index].props.onClick();
  await act(async()=>open(0));
  const dialog=()=>root.root.findByType(Dialog);
  assert.equal(dialog().props.open,true);
  const view=()=>root.toJSON().children.find(node=>node.type==='dialog-shell').children;
  const before=JSON.stringify(view());
  await act(async()=>dialog().props.onOpenChange(false));
  assert.equal(dialog().props.open,false);
  assert.equal(JSON.stringify(view()),before,'closing must retain the rendered title, version, body and controls');
  await act(async()=>root.root.findAllByType('button').find(b=>b.children.includes('通过审核，安排发布')).props.onClick());
  assert.deepEqual(writes,[],'fading controls cannot submit another action');
  await act(async()=>open(1));
  assert.equal(dialog().props.open,true);
  assert.equal(root.root.findByType('dialog-content').findByType('header').findByType('h2').children[0],'第二稿');
  assert.match(JSON.stringify(root.toJSON()),/第二稿正文/);
 }finally{if(root)await act(async()=>root.unmount());}
});

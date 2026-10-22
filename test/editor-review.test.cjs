const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');

// The review note is collected in an accessible dialog (not window.prompt).
// Cancelling sends nothing, and an in-flight review disables every review action.
test('editor review cancellation sends nothing and an in-flight review disables both actions',async()=>{
 let finish,fail;
 const writes=[],alerts=[];
 const item={id:7,username:'本地申请人',email:'preview@example.invalid',status:'pending',reason:'测试申请'};
 const api=(path,options)=>options?(writes.push({path,...options}),new Promise((resolve,reject)=>{finish=resolve;fail=reject;})):Promise.resolve([item]);
 const code=ts.transpileModule(fs.readFileSync('src/app/pages/AdminEditorApplicationsPage.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const module={exports:{}};
 new Function('exports','require',code)(module.exports,name=>name.endsWith('/api')?{api}:name.endsWith('/feedback')?{notify:{success:()=>{},error:message=>alerts.push(message)}}:name.endsWith('/AdminState')?{AdminEmpty:()=>null,AdminError:()=>null,AdminLoading:()=>null,AdminNotice:()=>null}:name==='react-router-dom'?{Link:'a'}:name.endsWith('/dialog')?{Dialog:({open,children})=>open?children:null,DialogContent:'div',DialogTitle:'h2',DialogDescription:'p'}:require(name));
 let root;
 const text=node=>[].concat(node.props.children).join('');
 const button=match=>root.root.findAllByType('button').find(node=>match(String(node.props['aria-label']||''),text(node)));
 const rowApprove=()=>button(label=>label.startsWith('通过'));
 const rowReject=()=>button(label=>label.startsWith('拒绝'));
 const cancel=()=>button((_l,body)=>body==='取消');
 const confirm=()=>button((_l,body)=>/^(确认通过|确认拒绝|提交中…)$/.test(body));
 const reviewButtons=()=>[rowApprove(),rowReject(),cancel(),confirm()].filter(Boolean);
 try{
  await act(async()=>{root=create(React.createElement(module.exports.default));});
  // Open the dialog, then cancel: nothing is written.
  await act(async()=>{rowApprove().props.onClick();});
  assert.ok(confirm(),'The note dialog opens before anything is sent');
  await act(async()=>{cancel().props.onClick();});
  assert.equal(writes.length,0,'Cancel must leave approval and rejection unchanged');
  assert.equal(confirm(),undefined,'Cancel closes the dialog');
  // Approve with an empty note: every review action is disabled while it is in flight.
  let pending;
  await act(async()=>{rowApprove().props.onClick();});
  await act(async()=>{pending=confirm().props.onClick();});
  assert.ok(reviewButtons().every(node=>node.props.disabled));
  await act(async()=>{rowReject().props.onClick();});
  assert.equal(writes.length,1,'Only one review can run at a time');
  assert.deepEqual(JSON.parse(writes[0].body),{status:'approved',review_note:''});
  await act(async()=>{finish({message:'已通过'});await pending;});
  assert.ok(reviewButtons().every(node=>!node.props.disabled));
  // Reject with a note; a failure re-enables the actions and reports the error.
  await act(async()=>{rowReject().props.onClick();});
  await act(async()=>{root.root.findByType('textarea').props.onChange({target:{value:'补充理由'}});});
  await act(async()=>{pending=confirm().props.onClick();});
  assert.deepEqual(JSON.parse(writes[1].body),{status:'rejected',review_note:'补充理由'});
  await act(async()=>{fail(new Error('本地模拟失败'));await pending;});
  assert.ok(reviewButtons().every(node=>!node.props.disabled));
  assert.deepEqual(alerts,['本地模拟失败']);
  assert.ok(confirm(),'A failed review keeps the dialog open for retry');
  assert.equal(root.root.findByType('textarea').props.value,'补充理由','A failed review preserves the note');
  await act(async()=>{pending=confirm().props.onClick();});
  assert.equal(writes.length,3,'Retry sends one new review request');
  assert.deepEqual(JSON.parse(writes[2].body),{status:'rejected',review_note:'补充理由'});
  await act(async()=>{finish({message:'已拒绝'});await pending;});
  assert.equal(confirm(),undefined,'Successful retry closes the dialog');
 }finally{
  if(root)await act(async()=>root.unmount());
 }
});

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');

test('editor review cancellation sends nothing and an in-flight review disables both actions',async()=>{
 const saved=Object.getOwnPropertyDescriptor(global,'window');
 let note=null,finish,fail;
 const writes=[],alerts=[];
 const item={id:7,username:'本地申请人',email:'preview@example.invalid',status:'pending',reason:'测试申请'};
 const api=(path,options)=>options?(writes.push({path,...options}),new Promise((resolve,reject)=>{finish=resolve;fail=reject;})):Promise.resolve([item]);
 const code=ts.transpileModule(fs.readFileSync('src/app/pages/AdminEditorApplicationsPage.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const module={exports:{}};
 new Function('exports','require',code)(module.exports,name=>name.endsWith('/api')?{api}:name.endsWith('/feedback')?{notify:{success:()=>{},error:message=>alerts.push(message)}}:name.endsWith('/AdminBack')?{AdminBack:'a'}:name.endsWith('/useAdminList')?{useAdminListQuery:()=>({filters:{status:'pending'},changeParams(){}})}:name.endsWith('/ThemeSelect')?{ThemeSelect:()=>null}:name==='react-router-dom'?{Link:'a'}:require(name));
 Object.defineProperty(global,'window',{value:{prompt:()=>note},configurable:true});
 let root;
 try{
  await act(async()=>{root=create(React.createElement(module.exports.default));});
  const actions=()=>root.root.findAllByType('button');
  await act(async()=>{await actions()[0].props.onClick();});
  await act(async()=>{await actions()[1].props.onClick();});
  assert.equal(writes.length,0,'Cancel must leave approval and rejection unchanged');
  note='';let pending;
  await act(async()=>{pending=actions()[0].props.onClick();});
  assert.ok(actions().every(button=>button.props.disabled));
  await act(async()=>{await actions()[1].props.onClick();});
  assert.equal(writes.length,1,'Only one review can run at a time');
  assert.deepEqual(JSON.parse(writes[0].body),{status:'approved',review_note:''});
  await act(async()=>{finish({message:'已通过'});await pending;});
  assert.ok(actions().every(button=>!button.props.disabled));
  note='补充理由';
  await act(async()=>{pending=actions()[1].props.onClick();});
  assert.deepEqual(JSON.parse(writes[1].body),{status:'rejected',review_note:'补充理由'});
  await act(async()=>{fail(new Error('本地模拟失败'));await pending;});
  assert.ok(actions().every(button=>!button.props.disabled));
  assert.deepEqual(alerts,['本地模拟失败']);
 }finally{
  if(root)await act(async()=>root.unmount());
  if(saved)Object.defineProperty(global,'window',saved);else delete global.window;
 }
});

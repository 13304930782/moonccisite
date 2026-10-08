const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs');
const React=require('react'),{act,create}=require('react-test-renderer');

test('visible choices retain explicit accessible names inside form labels and preserve empty-value filters',async()=>{
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync('src/app/components/ThemeSelect.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('exports','require',code)(module.exports,name=>name.endsWith('.css')?{}:name==='lucide-react'?{Check:'svg'}:require(name));
 const Select=module.exports.ThemeSelect,changes=[];
 const render=(value,allowEmpty=true)=>React.createElement('label',null,'状态',React.createElement(Select,{'aria-label':'筛选状态',value,allowEmpty,onValueChange:v=>changes.push(v)},[
  React.createElement('option',{key:'all',value:''},'全部'),React.createElement('option',{key:'pending',value:'pending'},'待审核'),React.createElement('option',{key:'disabled',value:'disabled',disabled:true},'不可用')
 ]));
 let root;
 try{
  await act(async()=>{root=create(render(''));});
  const radios=()=>root.root.findAllByProps({role:'radio'});
  assert.deepEqual(radios().map(r=>r.props['aria-label']),['全部','待审核','不可用'],'outer form label must never replace an option name');
  assert.deepEqual(radios().map(r=>r.props.tabIndex),[0,-1,-1]);
  assert.equal(radios()[0].props['aria-checked'],true);
  assert.equal(radios()[2].props.disabled,true);
  await act(async()=>radios()[1].props.onClick());assert.deepEqual(changes,['pending']);
  await act(async()=>root.update(render('pending')));
  assert.equal(radios()[1].props['aria-checked'],true);assert.equal(radios()[1].props.tabIndex,0);
  const native=root.root.findByType('select');assert.equal(String(native.props['aria-hidden']),'true');assert.equal(native.props.tabIndex,-1);assert.equal(native.props.value,'pending');
  await act(async()=>root.update(render('',false)));
  assert.deepEqual(radios().map(r=>r.props['aria-label']),['待审核','不可用']);assert.equal(radios()[0].props.tabIndex,0);
 }finally{if(root)await act(async()=>root.unmount());}
});

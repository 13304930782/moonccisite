const {fixture:i18nFixture}=require('./helpers/i18n.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');

test('editor application blocks duplicate submissions and preserves failed input for retry',async()=>{
 const writes=[];let finish,fail;
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync('src/app/pages/EditorApplyPage.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mocks={
  '../lib/api':{api:(path,options)=>{writes.push({path,...options});return new Promise((resolve,reject)=>{finish=resolve;fail=reject;});}},
  '../lib/feedback':{notify:{success(){}}},
  '../context/AuthContext':{useAuth:()=>({user:{id:2,username:'读者',role:'user'}})},
  '../lib/useUnsavedLeave':{useUnsavedLeave(){}},
  '../components/LocaleLink':{Link:'a'},
  '../components/admin/AdminState':{AdminNotice:({children})=>React.createElement('p',{role:'alert'},children)},
  '../components/admin/AdminButton':{AdminButton:({children,variant,...props})=>React.createElement('button',props,children)},
 };
 new Function('exports','require',code)(module.exports,name=>i18nFixture(name)?i18nFixture(name):name.endsWith('.css')?{}:mocks[name]||require(name));
 let root;
 try{
  await act(async()=>{root=create(React.createElement(module.exports.default));});
  await act(async()=>root.root.findByType('textarea').props.onChange({target:{value:'希望整理开发经验。'}}));
  const submit=()=>root.root.findByType('form').props.onSubmit({preventDefault(){}});
  await act(async()=>{submit();submit();});
  assert.equal(writes.length,1);
  assert.equal(root.root.findByType('textarea').props.disabled,true);
  await act(async()=>fail(new Error('模拟失败')));
  assert.equal(root.root.findByType('textarea').props.value,'希望整理开发经验。');
  assert.equal(root.root.findByType('textarea').props.disabled,false);
  assert.equal(root.root.findByProps({role:'alert'}).children[0],'模拟失败');
  await act(async()=>{submit();});
  assert.equal(writes.length,2);
  assert.deepEqual(JSON.parse(writes[1].body),{reason:'希望整理开发经验。'});
  await act(async()=>finish({message:'已提交'}));
  assert.equal(root.root.findByType('textarea').props.value,'');
 }finally{if(root)await act(async()=>root.unmount());}
});

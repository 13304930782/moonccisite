const {fixture:i18nFixture}=require('./helpers/i18n.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs');
const React=require('react'),{act,create}=require('react-test-renderer');
function loadSelect(){
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync('src/app/components/ThemeSelect.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const dropdown={Select:props=>React.createElement('themed-select',props),SelectTrigger:props=>React.createElement('button',{role:'combobox',...props}),SelectValue:()=>null,SelectContent:({sideOffset,...props})=>React.createElement('div',props),SelectItem:props=>React.createElement('themed-option',props)};
 new Function('exports','require',code)(module.exports,name=>i18nFixture(name)?i18nFixture(name):name.endsWith('.css')?{}:name==='./ui/select'?dropdown:name==='lucide-react'?{Check:'svg'}:require(name));
 return module.exports.ThemeSelect;
}

test('visible choices retain explicit accessible names inside form labels and preserve empty-value filters',async()=>{
 const Select=loadSelect(),changes=[];
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

test('native and themed choices preserve form values and focus required errors',async()=>{
 const {JSDOM}=require('jsdom');
 const dom=new JSDOM('<div id="host"></div>',{url:'http://localhost/',pretendToBeVisual:true}),saved=new Map();
 for(const [key,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true})){
  saved.set(key,Object.getOwnPropertyDescriptor(global,key));Object.defineProperty(global,key,{value,writable:true,configurable:true});
 }
 const {createRoot}=require('react-dom/client'),Select=loadSelect();let root;
 const changes=[];
 function Harness({allowEmpty=false,disabled=false,count=8,compact=false}){
  const [value,setValue]=React.useState('');
  return React.createElement('form',null,React.createElement('label',{htmlFor:'hour'},'时间'),React.createElement('p',{id:'hint'},'选择发布小时'),
   React.createElement(Select,{id:'hour',name:'hour','aria-label':'发布小时','aria-describedby':'hint',value,allowEmpty,required:true,disabled,compact,onValueChange:next=>{changes.push(next);setValue(next);}},
    [React.createElement('option',{key:'empty',value:''},'请选择'),...Array.from({length:count},(_,i)=>React.createElement('option',{key:i,value:String(i),disabled:i===3},i+'时'))]));
 }
 const render=props=>React.act(async()=>root.render(React.createElement(Harness,props)));
 try{
  root=createRoot(document.getElementById('host'));await render({});
  let select=document.querySelector('select'),form=document.querySelector('form');
  assert.equal(document.querySelector('[role=radio]'),null);assert.equal(document.querySelectorAll('select').length,1);
  assert.equal(select.id,'hour');assert.equal(select.getAttribute('aria-hidden'),null);assert.equal(select.tabIndex,0);
  assert.equal(select.options[0].disabled,true);assert.equal(select.options[0].hidden,true);assert.equal(select.options[4].disabled,true);
  await React.act(async()=>assert.equal(form.reportValidity(),false));
  assert.equal(document.activeElement,select);assert.equal(select.getAttribute('aria-invalid'),'true');
  const describedBy=select.getAttribute('aria-describedby').split(' ');assert.equal(describedBy[0],'hint');assert.equal(document.getElementById(describedBy[1]).textContent,'请选择一项。');
  await React.act(async()=>{select.value='6';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  assert.deepEqual(changes,['6']);assert.equal(new dom.window.FormData(form).get('hour'),'6');assert.equal(select.getAttribute('aria-invalid'),null);assert.equal(select.getAttribute('aria-describedby'),'hint');
  await render({disabled:true});assert.equal(select.disabled,true);assert.equal(new dom.window.FormData(form).has('hour'),false);
  await render({allowEmpty:true});assert.equal(select.disabled,false);assert.equal(select.options[0].disabled,false);
  await React.act(async()=>{select.value='';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});assert.equal(changes.at(-1),'');
  await render({count:7});assert.equal(document.querySelectorAll('[role=radio]').length,7);assert.equal(document.querySelector('select').getAttribute('aria-hidden'),'true');
  await React.act(async()=>assert.equal(form.reportValidity(),false));assert.equal(document.activeElement,document.querySelector('[role=radio]'));
  const press=key=>React.act(async()=>document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true})));
  await press('End');assert.equal(new dom.window.FormData(form).get('hour'),'6');
  await press('ArrowLeft');await press('ArrowLeft');await press('ArrowLeft');assert.equal(new dom.window.FormData(form).get('hour'),'2','arrow navigation skips the disabled option');
  await render({count:3,compact:true});
  let trigger=document.querySelector('button[role=combobox]');select=document.querySelector('select');
  assert.equal(trigger.id,'hour');assert.equal(trigger.getAttribute('aria-label'),'发布小时');
  assert.equal(document.querySelectorAll('[role=radio]').length,0);assert.ok(document.querySelector('.theme-select-menu'));
  await React.act(async()=>{select.value='';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  await React.act(async()=>assert.equal(form.reportValidity(),false));assert.equal(document.activeElement,trigger);
  assert.equal(trigger.getAttribute('aria-invalid'),'true');
  await React.act(async()=>{select.value='1';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  assert.equal(new dom.window.FormData(form).get('hour'),'1','themed dropdowns must submit raw form values');
  assert.equal(trigger.getAttribute('aria-invalid'),null);
  await render({count:3,compact:true,disabled:true});assert.equal(new dom.window.FormData(form).has('hour'),false);
 }finally{
  if(root)await React.act(async()=>root.unmount());dom.window.close();
  for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(global,key,descriptor);else delete global[key];}
 }
});

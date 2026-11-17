const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
const {fixture}=require('./helpers/i18n.cjs');
global.IS_REACT_ACT_ENVIRONMENT=true;
function setup(){
 let accept=false,confirmations=0;const writes=[];const item={id:1,title:'Series',slug:'series',description:'',cover_image:'',article_count:1};
 const overrides={
  '../i18n':fixture('../i18n'),
  '../lib/useUnsavedLeave':{useUnsavedLeave:()=>{}},
  '../lib/confirmAction':{confirmAction:async()=>{confirmations++;return accept;}},
  '../lib/api':{api:async(path,options)=>{if(options){writes.push({path,options});return item;}return {items:path.includes('/articles')?[{id:1,title:'Article',status:'published'}]:[item]};}},
  '../lib/safeUrl':{safeImageSrc:value=>value},
  '../components/LocaleLink':{Link:({to,children,...props})=>React.createElement('a',{href:to,...props},children)},
  '../components/admin/AdminButton':{AdminButton:({children,asChild,variant,size,...props})=>asChild?children:React.createElement('button',props,children)},
  '../components/ContentUI':{StatusNotice:({children})=>React.createElement('div',null,children)},
  '../components/ArticleMediaPicker':{ArticleMediaPicker:()=>null},
  '../components/ContentTranslationEditor':{ContentTranslationEditor:({onStateChange})=>React.createElement('div',null,React.createElement('button',{onClick:()=>onStateChange({dirty:true,busy:false})},'English dirty'),React.createElement('button',{onClick:()=>onStateChange({dirty:true,busy:true})},'English busy'))},
 };
 const output=ts.transpileModule(fs.readFileSync('src/app/pages/AdminSeriesPage.tsx','utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const module={exports:{}};new Function('require','module','exports',output)(name=>name in overrides?overrides[name]:name.endsWith('.css')?{}:require(name),module,module.exports);
 return {Page:module.exports.default,writes,setAccept:value=>{accept=value;},confirmations:()=>confirmations};
}
const button=(root,text)=>root.root.findAllByType('button').find(node=>node.children.some(value=>value===text));
async function open(context){let root;await act(async()=>{root=create(React.createElement(context.Page));});await act(async()=>button(root,'编辑与排序').props.onClick());return root;}
test('series cancellation includes unsaved English changes and respects declined confirmation',async()=>{
 const c=setup(),root=await open(c);
 await act(async()=>button(root,'English dirty').props.onClick());
 await act(async()=>button(root,'取消编辑').props.onClick());
 assert.equal(c.confirmations(),1);assert.equal(root.root.findAllByType('form').length,1);assert.equal(c.writes.length,0);
 c.setAccept(true);await act(async()=>button(root,'取消编辑').props.onClick());assert.equal(root.root.findAllByType('form').length,0);await act(async()=>root.unmount());
});
test('series save waits for the English discard decision and blocks during English save',async()=>{
 const c=setup(),root=await open(c);
 await act(async()=>button(root,'English dirty').props.onClick());
 await act(async()=>root.root.findByType('form').props.onSubmit({preventDefault(){}}));
 assert.equal(c.confirmations(),1);assert.equal(c.writes.length,0);assert.equal(root.root.findAllByType('form').length,1);
 await act(async()=>button(root,'English busy').props.onClick());
 await act(async()=>root.root.findByType('form').props.onSubmit({preventDefault(){}}));assert.equal(c.writes.length,0);
 await act(async()=>button(root,'English dirty').props.onClick());c.setAccept(true);
 await act(async()=>root.root.findByType('form').props.onSubmit({preventDefault(){}}));assert.equal(c.writes.length,2);assert.equal(root.root.findAllByType('form').length,0);await act(async()=>root.unmount());
});

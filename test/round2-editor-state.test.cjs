const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
function load(file,modules){const result={exports:{}};new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(result.exports,name=>modules[name]||require(name));return result.exports;}
async function draftFixture(){
 let hook,root,pendingSave=null,pendingAction=null,fail=false;const writes=[],actions=[];
 let draft={id:'fixture',version:1,payload:{title:'Original',content:'Body',summary:'Manual summary',summary_mode:'manual',tags:['a','b']},updated_at:new Date().toISOString()};
 const api=async(url,options={})=>{
  if(options.method==='PUT'){const body=JSON.parse(options.body);writes.push(body);if(pendingSave)await pendingSave.promise;if(fail)throw Error('Offline');draft={...draft,version:draft.version+1,payload:body.payload};return draft;}
  if(options.method==='POST'){actions.push(url);if(pendingAction)await pendingAction.promise;return {...draft,post_status:'published'};}
  return draft;
 };
 const code=ts.transpileModule(fs.readFileSync('src/app/lib/useArticleDraft.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,result={exports:{}};
 new Function('exports','require','location','history','sessionStorage',code)(result.exports,name=>name==='react'?React:name==='react-router-dom'?{useNavigate:()=>()=>{}}:name==='./api'?{api,ApiError:class extends Error{}}:name==='./articleDraftState'?require('./helpers/article-draft-state.cjs'):name==='./articleAge'?require('./helpers/article-age.cjs'):name==='./feedback'?{notify:{success(){},error(){}}}:name==='./draftStorage'?{readBackup:async()=>null,writeBackup:async()=>{}}:{useUnsavedLeave(){}},{search:'?draft=fixture',href:'https://example.test/admin/write?draft=fixture'},{replaceState(){}},{removeItem(){}});
 function Probe(){hook=result.exports.useArticleDraft(1);return null;}
 await act(async()=>{root=create(React.createElement(Probe));});
 return{get hook(){return hook;},writes,actions,holdSave(){pendingSave=deferred();return pendingSave;},holdAction(){pendingAction=deferred();return pendingAction;},fail(){fail=true;},close:()=>act(()=>root.unmount())};
}
test('round2 identical rapid manual saves coalesce and a failed pending save never retries itself',async()=>{
 for(const fail of [false,true]){const f=await draftFixture();try{
  const hold=f.holdSave();if(fail)f.fail();let first,second,third;
  await act(async()=>{f.hook.update({...f.hook.form,title:'Keep this input'});first=f.hook.save('manual');second=f.hook.save('manual');third=f.hook.save('manual');});
  assert.equal(f.writes.length,1);
  await act(async()=>{hold.resolve();await Promise.all([first,second,third]);});
  assert.equal(f.writes.length,1);assert.equal(f.hook.form.title,'Keep this input');assert.equal(f.hook.dirty,fail);
  assert.deepEqual(f.hook.form.tags,['a','b']);
 }finally{f.close();}}
});
test('round2 publication guard begins before await and a late action response preserves newer writing',async()=>{
 const f=await draftFixture();try{const hold=f.holdAction();let first,second;
  await act(async()=>{first=f.hook.action('publish');second=f.hook.action('publish');});
  assert.equal(f.actions.length,1);assert.equal(await second,false);
  await act(async()=>f.hook.update({...f.hook.form,content:'Typed while publishing'}));
  await act(async()=>{hold.resolve();assert.equal(await first,true);});
  assert.equal(f.hook.form.content,'Typed while publishing');assert.equal(f.hook.dirty,true);
 }finally{f.close();}
});
test('round2 picker IME does not search and an upload cannot override a later existing-image selection',async()=>{
 const upload=deferred(),requests=[],picked=[];let root;
 const modules={'react':React,'lucide-react':{Check:'svg'},'@radix-ui/react-dialog':Object.fromEntries(['Root','Portal','Overlay','Content','Title','Description','Close'].map(key=>[key,key==='Close'?'button':'div'])),'../lib/safeUrl':{safeImageSrc:value=>value||''},'../lib/api':{api:async url=>{requests.push(url);return {items:[{filename:'existing.png',url:'/existing.png',display_name:'Existing'}],total:1};}}};
 const {ArticleMediaPicker}=load('src/app/components/ArticleMediaPicker.tsx',modules);
 try{
  await act(async()=>{root=create(React.createElement(ArticleMediaPicker,{onSelect:(...args)=>picked.push(args),onClose(){},uploadImage:()=>upload.promise}));});
  const input=root.root.findByProps({'aria-label':'搜索图片'}),submit=()=>root.root.findByType('form').props.onSubmit({preventDefault(){}});
  await act(async()=>{input.props.onCompositionStart();input.props.onChange({target:{value:'输入中'}});submit();});assert.equal(requests.length,1);
  await act(async()=>input.props.onCompositionEnd());await act(async()=>submit());assert.equal(requests.length,2);
  await act(async()=>root.root.findByProps({'aria-label':'上传图片'}).props.onChange({target:{files:[{name:'uploaded.png'}],value:'x'}}));
  await act(async()=>root.root.findAllByType('button').find(node=>node.props['aria-pressed']===false).props.onClick());
  await act(async()=>upload.resolve('/uploaded.png'));
  const done=root.root.findByProps({'aria-label':'使用图片'});await act(async()=>{done.props.onClick();done.props.onClick();});
  assert.deepEqual(picked,[['/existing.png','']]);
 }finally{await act(async()=>root?.unmount());}
});
test('round2 SimpleEditor parses initial content once and does not reparse on unrelated parent renders',async()=>{
 let parses=0,sanitizes=0,root;const updates=[];
 const tr={setMeta(){return tr;}},editor={isEditable:true,state:{doc:{descendants(){}} ,tr},view:{dispatch(){}},commands:{setContent(value){updates.push(value);},setEditable(){} }};
 const component=React.forwardRef(({children},_ref)=>React.createElement('div',null,children));
 const extension={configure(){return extension;}};
 const extensions=new Proxy({},{get:()=>extension}),components=new Proxy({},{get:()=>component});
 const mocks={'react':React,'@tiptap/react':{EditorContent:()=>null,EditorContext:React.createContext({editor:null}),useEditor:()=>editor,useEditorState:()=>false,useCurrentEditor:()=>({editor:null})},'@/hooks/use-is-breakpoint':{useIsBreakpoint:()=>false},'@/app/lib/richText':{isRichText:()=>false,RICH_TEXT_MARKER:'rich',sanitizeRichText:value=>{sanitizes++;return value;}}};
 const result={exports:{}};
 new Function('exports','require',ts.transpileModule(fs.readFileSync('src/components/tiptap-templates/simple/simple-editor.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(result.exports,name=>mocks[name]||name==='react/jsx-runtime'&&require(name)||name.endsWith('.scss')&&{}||(name.startsWith('@tiptap/')||name.includes('/tiptap-node/'))&&extensions||components);
 const props={value:'Initial',parseLegacy:value=>{parses++;return '<p>'+value+'</p>';},onChange(){},onError(){},onBusy(){},uploadImage:async()=>''};
 try{
  await act(async()=>{root=create(React.createElement(result.exports.SimpleEditor,props));});assert.equal(parses,1);assert.equal(sanitizes,1);
  for(let n=0;n<12;n++)await act(async()=>root.update(React.createElement(result.exports.SimpleEditor,{...props,onChange(){}})));
  assert.equal(parses,1);assert.equal(sanitizes,1);assert.deepEqual(updates,[]);
  await act(async()=>root.update(React.createElement(result.exports.SimpleEditor,{...props,value:'Activated latest content'})));
  assert.equal(parses,2);assert.equal(sanitizes,2);assert.deepEqual(updates,['<p>Activated latest content</p>']);
 }finally{await act(async()=>root?.unmount());}
});

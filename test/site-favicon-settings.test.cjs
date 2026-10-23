const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');

test('favicon media selection is a draft until saved, cancellation preserves it and save failures allow retry',async()=>{
 const brand={site_title:'Blog',logo_url:'/logo.png',favicon_url:'/old.ico'};
 const site={brand,hero:{title:'Hello'},footer:{}};
 const writes=[];let fail=true,root;
 const api=async(path,options)=>{
  if(options){writes.push(JSON.parse(options.body));if(fail)throw Error('Save failed');return {...site,...JSON.parse(options.body)};}
  return path==='/now'?{content:'',updated_at:null}:site;
 };
 function Picker(){return null;}
 const code=ts.transpileModule(fs.readFileSync('src/app/pages/AdminSiteSettingsPage.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const module={exports:{}};
 const mock=name=>name.endsWith('.css')?{}:name.endsWith('/api')?{api}:name.endsWith('/useUnsavedLeave')?{useUnsavedLeave(){}}:name.endsWith('/safeUrl')?{safeImageSrc:x=>x||''}:name.endsWith('/ArticleMediaPicker')?{ArticleMediaPicker:Picker}:name.endsWith('/MarkdownContent')?{MarkdownContent:()=>null}:name.endsWith('/AdminWeatherCompanionSettings')?{AdminWeatherCompanionSettings:()=>null}:name==='react-router-dom'?{Link:'a'}:require(name);
 new Function('exports','require','window',code)(module.exports,mock,{dispatchEvent(){}});
 const open=()=>root.root.findAllByType('button').find(b=>b.children.includes('从媒体库选择')).props.onClick();
 const value=()=>root.root.findByProps({'aria-label':'网页图标地址'}).props.value;
 const save=()=>root.root.findByProps({id:'brand'}).props.onSubmit({preventDefault(){}});
 try{
  await act(async()=>{root=create(React.createElement(module.exports.default));});
  await act(async()=>open());
  assert.equal(root.root.findByType(Picker).parent.type,'div','Picker must sit outside the section forms so its search does not submit settings');
  await act(async()=>root.root.findByType(Picker).props.onClose());
  assert.equal(value(),'/old.ico');assert.equal(writes.length,0);
  await act(async()=>open());
  await act(async()=>{const picker=root.root.findByType(Picker);picker.props.onSelect('/uploads/new.png','unused alt');picker.props.onClose();});
  assert.equal(value(),'/uploads/new.png');assert.equal(writes.length,0);
  await act(async()=>save());
  assert.equal(value(),'/uploads/new.png');assert.equal(root.root.findByProps({role:'alert'}).children[0],'Save failed');
  assert.deepEqual(writes[0],{brand:{...brand,favicon_url:'/uploads/new.png'}});
  fail=false;await act(async()=>save());
  assert.equal(writes.length,2);assert.equal(root.root.findAllByProps({role:'alert'}).length,0);
 }finally{if(root)await act(async()=>root.unmount());}
});

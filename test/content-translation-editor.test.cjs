const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react'),{act,create}=require('react-test-renderer');
const {fixture}=require('./helpers/i18n.cjs');
function load(api){const box={exports:{}};const code=ts.transpileModule(fs.readFileSync('src/app/components/ContentTranslationEditor.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('exports','require',code)(box.exports,name=>name.endsWith('.css')?{}:name.endsWith('/api')?{api}:name.endsWith('/useUnsavedLeave')?{useUnsavedLeave(){}}:name.endsWith('/ContentUI')?{}:fixture(name)||require(name));return box.exports.ContentTranslationEditor;}
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject};};
const row={draft:{name:'English'},version:1,published:null,source:{name:'已保存的原文'}};
const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.children?text(node.children):'';
test('translation load retries, failed save retains input, duplicate clicks send once and successful save retains persisted source',async()=>{
 let first=true,write;const writes=[];const Component=load((_path,options={})=>{if(options.method){writes.push(JSON.parse(options.body));write=deferred();return write.promise;}if(first){first=false;return Promise.reject(Error('Offline'));}return Promise.resolve(row);});let tree;
 await act(async()=>{tree=create(React.createElement(Component,{type:'project',id:1,source:{name:'未保存的新原文'}}));});
 await act(async()=>tree.root.findByType('details').props.onToggle({currentTarget:{open:true}}));
 const button=label=>tree.root.findAllByType('button').find(node=>text(node)===label);
 await act(async()=>button('重试').props.onClick());
 assert.equal(tree.root.findByType('small').children.join(''),'已保存的原文');
 await act(async()=>tree.root.findByType('input').props.onChange({target:{value:'Unsaved English'}}));
 await act(async()=>{const save=button('保存英文草稿');save.props.onClick();save.props.onClick();});assert.equal(writes.length,1);
 await act(async()=>write.reject(Error('Save failed')));assert.equal(tree.root.findByType('input').props.value,'Unsaved English');
 await act(async()=>button('保存英文草稿').props.onClick());await act(async()=>write.resolve({draft:{name:'Unsaved English'},version:2,published:null}));
 assert.equal(tree.root.findByType('small').children.join(''),'已保存的原文');assert.equal(button('保存英文草稿').props.disabled,true);await act(async()=>tree.unmount());
});
test('late response for previous translation identity cannot replace the newly opened editor',async()=>{
 const calls=[];const Component=load((path,options)=>{const work=deferred();calls.push({path,options,...work});return work.promise;});let tree;
 await act(async()=>{tree=create(React.createElement(Component,{type:'project',id:1,source:{}}));});await act(async()=>tree.root.findByType('details').props.onToggle({currentTarget:{open:true}}));
 await act(async()=>tree.update(React.createElement(Component,{type:'project',id:2,source:{}})));assert.equal(calls[0].options.signal.aborted,true);
 await act(async()=>calls[1].resolve({...row,draft:{name:'Second'}}));await act(async()=>calls[0].resolve({...row,draft:{name:'Stale'}}));assert.equal(tree.root.findByType('input').props.value,'Second');await act(async()=>tree.unmount());
});

test('site groups share one draft and save preserves edits in other sections',async()=>{
 let body;const Component=load(async (_path,options={})=>{if(options.method){body=JSON.parse(options.body);return {draft:body.draft,version:2,published:null};}return {draft:{brand:{site_title:'Old'},hero:{title:'Hero'},footer:{copyright:'Footer'}},version:1,published:null,source:{brand:{site_title:'中文'},hero:{title:'首页'},footer:{copyright:'版权'}}};});
 let tree;const props={type:'site',id:1,source:{brand:{site_title:'当前中文'},hero:{title:'当前首页'}}};
 await act(async()=>{tree=create(React.createElement(Component,{...props,visibleGroups:['brand']}));});
 await act(async()=>tree.root.findByType('details').props.onToggle({currentTarget:{open:true}}));
 assert.equal(tree.root.findByType('small').children.join(''),'当前中文');
 await act(async()=>tree.root.findByType('input').props.onChange({target:{value:'New brand'}}));
 await act(async()=>tree.update(React.createElement(Component,{...props,visibleGroups:['hero']})));
 assert.equal(tree.root.findByType('input').props.value,'Hero');
 await act(async()=>tree.root.findByType('input').props.onChange({target:{value:'New hero'}}));
 await act(async()=>tree.root.findAllByType('button').find(n=>text(n)==='保存英文草稿').props.onClick());
 assert.deepEqual(body.draft,{brand:{site_title:'New brand'},hero:{title:'New hero'},footer:{copyright:'Footer'}});
 await act(async()=>tree.unmount());
});

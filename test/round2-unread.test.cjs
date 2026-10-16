const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react'),{act,create}=require('react-test-renderer');
test('account unread badge refreshes after acknowledgement and rejects late polls across users',async()=>{
 const saved=new Map();for(const [key,value]of Object.entries({window:new EventTarget(),document:Object.assign(new EventTarget(),{visibilityState:'visible'})})){saved.set(key,Object.getOwnPropertyDescriptor(global,key));Object.defineProperty(global,key,{value,configurable:true});}
 let user=1,root;const reads=[];
 const link=({children,...props})=>React.createElement('a',props,children),imports={
  'react-router-dom':{Link:link,NavLink:link,useNavigate:()=>()=>{}},
  '../lib/useOperations':{useOperations:()=>false},'../lib/usePublishing':{usePublishing:()=>false},'../lib/useEngagement':{useEngagement:()=>true},
  '../context/AuthContext':{useAuth:()=>({user:{id:user,username:'fixture',role:'user'}})},'../context/ThemeContext':{ThemeToggle:()=>null},
  '../lib/api':{api:(path,options)=>new Promise(resolve=>reads.push({path,...options,resolve}))},
 };
 const code=ts.transpileModule(fs.readFileSync('src/app/components/AccountWorkspace.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,module={exports:{}};
 new Function('module','exports','require',code)(module,module.exports,name=>name.endsWith('.css')?{}:imports[name]||require(name));
 const badge=()=>root.root.findAll(node=>node.props['aria-label']==='3 条未读').length;
 try{
  await act(async()=>{root=create(React.createElement(module.exports.AccountWorkspace,null,'content'));});await act(async()=>reads[0].resolve({unread:3}));assert.equal(badge(),1);
  await act(async()=>window.dispatchEvent(new Event('mooncci:notifications-updated')));const old=reads[1];
  await act(async()=>window.dispatchEvent(new Event('mooncci:notifications-updated')));assert.equal(old.signal.aborted,true);
  await act(async()=>reads[2].resolve({unread:0}));await act(async()=>old.resolve({unread:3}));assert.equal(badge(),0);
  await act(async()=>{user=2;root.update(React.createElement(module.exports.AccountWorkspace,null,'content'));});assert.equal(badge(),0);
  const current=reads.at(-1);await act(async()=>root.unmount());root=null;assert.equal(current.signal.aborted,true);
 }finally{if(root)await act(async()=>root.unmount());for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(global,key,descriptor);else delete global[key];}}
});

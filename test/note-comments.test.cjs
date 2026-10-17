const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
function load(source, state){
 const module={exports:{}};
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mock=name=>name==='react'?React:name==='react/jsx-runtime'?require(name):name==='lucide-react'?Object.fromEntries(['Heart','MessageCircle','Reply','Send','Trash2','X'].map(x=>[x,'svg'])):name==='react-router-dom'?{Link:'a',useLocation:()=>({pathname:'/updates/4'})}:name.endsWith('/api')?{api:state.api}:name.endsWith('/AuthContext')?{useAuth:()=>({user:state.user})}:name.endsWith('/commentTime')?{formatCommentTime:x=>x}:name.endsWith('/feedback')?{notify:{success(){},error(){}}}:name.endsWith('/confirmAction')?{confirmAction:async()=>true}:{EmptyState:({children})=>React.createElement('div',null,children)};
 new Function('exports','require',code)(module.exports,mock);return module.exports.CommentSection;
}
const source=fs.readFileSync('src/app/components/CommentSection.tsx','utf8');
const row={id:1,user_id:3,content:'已有评论',status:'visible',author_name:'读者',author_role:'user',created_at:'2026-10-17',liked_by_me:false,like_count:0};
test('note regions omit the China prefix only when a region is present; other variants retain data',async()=>{
 for(const [raw,display] of [['中国广东','广东'],['中国香港','香港'],['中国澳门','澳门'],['中国台湾','台湾'],['美国','美国'],['中国','中国']]){
  for(const variant of ['note',undefined]){
   const root=await mount({user:null,api:async()=>[{...row,ip_location:raw}]},{variant});
   const location=root.root.findAllByType('span').find(n=>n.children[0]==='来自 ');
   assert.equal(location.children.join(''),'来自 '+(variant==='note'?display:raw));root.unmount();
  }
 }
});
async function mount(state,props={}){let root;await act(async()=>{root=create(React.createElement(load(source,state),{updateId:4,...props}));});return root;}
test('note composer preserves review policy, disables empty input and retains failed input',async()=>{
 const state={user:{id:3,username:'读者',role:'user'},api:async(_,options)=>{if(options)throw Error('离线');return [];}};
 const root=await mount(state,{variant:'note'});
 assert.equal(root.root.findByType('h2').props.tabIndex,-1);
 let input=root.root.findByType('textarea');assert.equal(input.props.rows,1);assert.equal(input.props.placeholder,'说点什么…');
 assert.equal(root.root.findByProps({'aria-label':'发表评论'}).props.disabled,true);
 assert.match(JSON.stringify(root.toJSON()),/审核通过后公开/);assert.match(JSON.stringify(root.toJSON()),/还没有人讨论/);
 await act(async()=>input.props.onChange({target:{value:'保留输入'}}));
 assert.equal(root.root.findByProps({'aria-label':'发表评论'}).props.disabled,false);
 await act(async()=>root.root.findByType('form').props.onSubmit({preventDefault(){}}));
 assert.equal(root.root.findByType('textarea').props.value,'保留输入');assert.match(JSON.stringify(root.toJSON()),/离线/);root.unmount();
});
test('only own newly submitted comment is marked; loaded comments do not animate; count follows API',async()=>{
 let rows=[row],counts=[];
 const state={user:{id:3,username:'读者',role:'owner'},api:async(_,options)=>{if(options){rows=[...rows,{...row,id:2,content:'新评论'}];return {message:'发布成功'};}return rows;}};
 const root=await mount(state,{variant:'note',onCountChange:n=>counts.push(n)});
 assert.equal(root.root.findAll(n=>typeof n.props.className==='string'&&n.props.className.includes('note-comment-new')).length,0);
 await act(async()=>root.root.findByType('textarea').props.onChange({target:{value:'新评论'}}));
 await act(async()=>root.root.findByType('form').props.onSubmit({preventDefault(){}}));
 assert.equal(root.root.findAll(n=>typeof n.props.className==='string'&&n.props.className.includes('note-comment-new')).length,1);
 assert.equal(counts.at(-1),2);assert.equal(root.root.findByType('textarea').props.value,'');root.unmount();
});
test('note like motion begins only after a real user action; delete permission remains role based',async()=>{
 const state={user:{id:8,username:'访客',role:'user'},api:async()=>[row]};const root=await mount(state,{variant:'note'});
 assert.equal(root.root.findAllByProps({'data-note-like':'clicked'}).length,0);
 assert.equal(root.root.findAll(n=>String(n.props.className).includes('comment-delete')).length,0);
 await act(async()=>root.root.findAllByType('button').find(n=>String(n.props.className).startsWith('comment-like ')).props.onClick());
 assert.equal(root.root.findAllByProps({'data-note-like':'clicked'}).length,1);root.unmount();
});
test('default article and compact list markup stay identical to production baseline',async()=>{
 // Serialized DOM from 854189d with the synthetic row above; no Git history is needed in shallow CI checkouts.
 const baseline={
  'guest:false':'0f2ec1de44747dc6a14d4d305df913a28b641e13b16979b20d5e78f6f7da59db',
  'guest:true':'e0b54d1475046d8f2fdbf8fdec8683e1372e91cc7d810880a57027b638052ef1',
  'user:false':'cf669dfb4b518e23d7e8c3c024b582ed8b49146d042b339b2844debddca91793',
  'user:true':'6317a1fbee58af24cdef32cfb5883b026ac1bacf2ab57231f8f7ecea212254ba',
  'owner:false':'1f272ed4465c19f0ad9875c94b3103c95dfb81c9511b8c72aab5e3b0fab7a278',
  'owner:true':'2cf7e6ef1f5770d3f8a5e01cd4d56dce0fb0940cb94374e7efcb6e2c706263eb',
 };
 for(const user of [null,{id:3,username:'读者',role:'user'},{id:9,username:'站长',role:'owner'}])for(const compact of [false,true]){
 const state={user,api:async()=>[row]},props={updateId:4,compact};let after;
 await act(async()=>{after=create(React.createElement(load(source,state),props));});
 // React test JSON keeps undefined event props; stringify models actual serializable DOM.
 assert.equal(require('node:crypto').createHash('sha256').update(JSON.stringify(after.toJSON())).digest('hex'),baseline[(user?.role||'guest')+':'+compact]);after.unmount();
 }
});
test('note textarea grows to six lines and resets after clearing without leaking resize listeners',async()=>{
 const previousWindow=global.window,previousStyle=global.getComputedStyle;const listeners=new Set();
 global.window={addEventListener:(_,fn)=>listeners.add(fn),removeEventListener:(_,fn)=>listeners.delete(fn)};
 global.getComputedStyle=()=>({lineHeight:'24px',paddingTop:'0px',paddingBottom:'0px'});
 const input={style:{},scrollHeight:24};let root;
 try {
  await act(async()=>{root=create(React.createElement(load(source,{user:{id:3,username:'读者',role:'user'},api:async()=>[]}),{updateId:4,variant:'note'}),{createNodeMock:element=>element.type==='textarea'?input:null});});
  assert.equal(input.style.height,'24px');input.scrollHeight=240;
  await act(async()=>root.root.findByType('textarea').props.onChange({target:{value:'很多行'}}));
  assert.equal(input.style.height,'144px');assert.equal(input.style.overflowY,'auto');assert.equal(listeners.size,1);
  input.scrollHeight=24;await act(async()=>root.root.findByType('textarea').props.onChange({target:{value:''}}));
  assert.equal(input.style.height,'24px');assert.equal(input.style.overflowY,'hidden');
  await act(async()=>root.unmount());assert.equal(listeners.size,0);
 } finally {global.window=previousWindow;global.getComputedStyle=previousStyle;}
});

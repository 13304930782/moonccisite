const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');

function load(file,imports){
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('module','exports','require',code)(module,module.exports,name=>imports[name]||require(name));return module.exports;
}
function deferred(){let resolve,reject;const promise=new Promise((ok,fail)=>{resolve=ok;reject=fail;});return {promise,resolve,reject};}
const event={preventDefault(){}};
async function commentFixture(){
 const rows=[1,2].map(id=>({id,user_id:id,author_name:'reader'+id,content:'existing '+id,status:'visible',parent_id:null,liked_by_me:false,like_count:0,created_at:'2026-10-16T10:00:00Z'}));
 const reads=[],writes=[],notices=[];let holdReads=false,confirm=true,confirmCalls=0,root;
 const api=(path,options={})=>{if(!options.method){const pending=holdReads?deferred():null;reads.push({path,pending});return pending?pending.promise:Promise.resolve(rows.map(row=>({...row})));}const pending=deferred();writes.push({path,...options,...pending});return pending.promise;};
 const Component=load('src/app/components/CommentSection.tsx',{
  '../lib/api':{api},'../lib/feedback':{notify:{success:message=>notices.push({kind:'success',message}),error:message=>notices.push({kind:'error',message})}},
  '../lib/confirmAction':{confirmAction:()=>{confirmCalls++;return typeof confirm==='boolean'?Promise.resolve(confirm):confirm.promise;}},
  './DetailUI':{EmptyState:'div'},'react-router-dom':{useLocation:()=>({pathname:'/article/1'}),Link:'a'},
  './MotionDisclosure':{MotionDisclosure:({open,children,...props})=>React.createElement('div',{...props,hidden:!open},open?children:null)},'../lib/useMovingIndicator':{useMovingIndicator(){}},
  '../context/AuthContext':{useAuth:()=>({user:{id:1,username:'tester',role:'owner'}})},'../lib/commentTime':{formatCommentTime:()=>''},
 }).CommentSection;
 await act(async()=>{root=create(React.createElement(Component,{postId:1}));});
 const button=(name,index=0)=>root.root.findAllByType('button').filter(button=>button.children.includes(name))[index];
 return {root,rows,reads,writes,notices,button,get confirmCalls(){return confirmCalls;},setConfirm:value=>confirm=value,holdReads:()=>{holdReads=true;},
  content:()=>root.root.findByProps({'aria-label':'写下你的评论'}),compose:()=>root.root.findByProps({className:'comment-compose'}),
  reply:()=>root.root.findAllByType('textarea').find(field=>String(field.props['aria-label']).startsWith('回复 @')),
  replyForm:()=>root.root.findAllByType('form').find(form=>String(form.props.className).startsWith('comment-reply-compose')),
  likes:()=>root.root.findAllByType('button').filter(button=>String(button.props.className).startsWith('comment-like ')),
  close:()=>act(async()=>root.unmount()),
 };
}

test('comment submit locks synchronously and does not clear text edited while its response was pending',async()=>{
 const f=await commentFixture();try{
  await act(async()=>f.content().props.onChange({target:{value:'sent text'}}));let first;
  await act(async()=>{first=f.compose().props.onSubmit(event);f.compose().props.onSubmit(event);});
  assert.equal(f.writes.length,1);assert.equal(f.button('提交中...').props.disabled,true);assert.equal(f.button('提交中...').props['aria-busy'],true);
  assert.deepEqual(JSON.parse(f.writes[0].body),{content:'sent text'});
  await act(async()=>{f.content().props.onChange({target:{value:'new text'}});f.content().props.onChange({target:{value:'sent text'}});});
  await act(async()=>{f.writes[0].resolve({message:'comment accepted'});await first;});
  assert.equal(f.content().props.value,'sent text','editing back to the same text still counts as new input');
  assert.deepEqual(f.notices,[{kind:'success',message:'comment accepted'}]);
 }finally{await f.close();}
});

test('failed comment keeps input, releases its lock and only confirms a successful retry',async()=>{
 const f=await commentFixture();try{
  await act(async()=>f.content().props.onChange({target:{value:'keep my draft'}}));let pending;
  await act(async()=>{pending=f.compose().props.onSubmit(event);});
  await act(async()=>{f.writes[0].reject(Error('offline'));await pending;});
  assert.equal(f.content().props.value,'keep my draft');assert.equal(f.button('发表评论').props.disabled,false);
  assert.deepEqual(f.notices,[{kind:'error',message:'offline'}]);
  await act(async()=>{pending=f.compose().props.onSubmit(event);});
  assert.equal(f.writes.length,2);assert.deepEqual(JSON.parse(f.writes[1].body),{content:'keep my draft'});
  await act(async()=>{f.writes[1].resolve({message:'accepted'});await pending;});
  assert.equal(f.content().props.value,'');assert.equal(f.notices.at(-1).kind,'success');
 }finally{await f.close();}
});

test('old reply result preserves a newly selected reply target and its input',async()=>{
 const f=await commentFixture();try{
  await act(async()=>f.button('回复',0).props.onClick());
  await act(async()=>f.reply().props.onChange({target:{value:'reply for first reader'}}));let pending;
  await act(async()=>{pending=f.replyForm().props.onSubmit(event);f.replyForm().props.onSubmit(event);});
  assert.equal(f.writes.length,1);assert.equal(JSON.parse(f.writes[0].body).parent_id,1);
  await act(async()=>f.button('回复',1).props.onClick());
  await act(async()=>f.reply().props.onChange({target:{value:'new reply for second reader'}}));
  await act(async()=>{f.writes[0].resolve({message:'first reply accepted'});await pending;});
  assert.equal(f.reply().props['aria-label'],'回复 @reader2');assert.equal(f.reply().props.value,'new reply for second reader');
  await act(async()=>{pending=f.replyForm().props.onSubmit(event);});
  assert.deepEqual(JSON.parse(f.writes[1].body),{content:'new reply for second reader',parent_id:2,reply_to_user_id:2});
  await act(async()=>{f.writes[1].reject(Error('reply failed'));await pending;});
  assert.equal(f.reply().props.value,'new reply for second reader');
 }finally{await f.close();}
});

test('likes reject duplicate clicks, keep other comments usable and apply only acknowledged results',async()=>{
 const f=await commentFixture();try{
  let first,second;await act(async()=>{first=f.likes()[0].props.onClick();f.likes()[0].props.onClick();second=f.likes()[1].props.onClick();});
  assert.equal(f.writes.length,2);assert.equal(f.likes()[0].props.disabled,true);assert.equal(f.likes()[0].props['aria-busy'],true);
  assert.equal(f.likes()[0].props['aria-pressed'],false,'pending request must not pretend success');
  await act(async()=>{f.writes[0].reject(Error('like failed'));await first;});
  assert.equal(f.likes()[0].props.disabled,false);assert.equal(f.likes()[0].props['aria-pressed'],false);
  f.holdReads();await act(async()=>{f.writes[1].resolve({message:'liked'});await second;});
  assert.equal(f.likes()[1].props['aria-pressed'],true);assert.equal(f.likes()[1].props['aria-busy'],false);
  await act(async()=>{second=f.likes()[1].props.onClick();});assert.equal(f.writes[2].method,'DELETE','rapid next intent uses acknowledged state while refresh is slow');
  await act(async()=>{f.writes[2].resolve({message:'unliked'});await second;});assert.equal(f.likes()[1].props['aria-pressed'],false);
 }finally{await f.close();}
});

test('mutation completion refreshes the latest sort and ignores an obsolete list response',async()=>{
 const f=await commentFixture();try{
  f.holdReads();let pending;await act(async()=>{pending=f.likes()[0].props.onClick();});
  await act(async()=>f.button('最早').props.onClick());const old=f.reads.at(-1);
  await act(async()=>f.button('点赞量').props.onClick());
  await act(async()=>{f.writes[0].resolve({message:'liked'});await pending;});
  assert.equal(f.reads.at(-1).path,'/comments/post/1?sort=likes');
  await act(async()=>f.reads.at(-1).pending.resolve(f.rows.map(row=>({...row,content:'current sort row',liked_by_me:true}))));
  await act(async()=>old.pending.resolve(f.rows.map(row=>({...row,content:'stale old sort row'}))));
  const text=f.root.root.findAllByType('p').map(p=>p.children.join(' ')).join(' ');assert.match(text,/current sort row/);assert.doesNotMatch(text,/stale old sort row/);
 }finally{await f.close();}
});

test('delete still needs confirmation, prevents repeated confirmations/writes and releases after failure',async()=>{
 const f=await commentFixture();try{
  f.setConfirm(false);await act(async()=>f.button('删除',0).props.onClick());assert.equal(f.writes.length,0);
  const confirmation=deferred();f.setConfirm(confirmation);let first;
  await act(async()=>{first=f.button('删除',0).props.onClick();f.button('删除',0).props.onClick();});
  assert.equal(f.confirmCalls,2,'one cancelled confirmation plus one in-flight confirmation');assert.equal(f.writes.length,0);
  await act(async()=>confirmation.resolve(true));assert.equal(f.writes.length,1);assert.equal(f.button('删除中…').props.disabled,true);
  await act(async()=>{f.writes[0].reject(Error('delete failed'));await first;});assert.equal(f.button('删除',0).props.disabled,false);
  f.setConfirm(true);f.holdReads();await act(async()=>{first=f.button('删除',0).props.onClick();});
  await act(async()=>{f.writes[1].resolve({message:'deleted'});await first;});
  assert.equal(f.root.root.findAllByType('div').filter(div=>String(div.props.className).startsWith('comment-thread')).length,1,'acknowledged deletion removes the row before its slow refresh');
 }finally{await f.close();}
});

test('unmounted comment thread ignores late write feedback and does not refresh the old target',async()=>{
 const f=await commentFixture();let pending;
 await act(async()=>{pending=f.likes()[0].props.onClick();});const reads=f.reads.length;await f.close();
 await act(async()=>{f.writes[0].resolve({message:'liked'});await pending;});assert.equal(f.reads.length,reads);assert.deepEqual(f.notices,[]);
});

async function bookmarkFixture(){
 const saved=new Map(),values={window:new EventTarget(),document:Object.assign(new EventTarget(),{visibilityState:'visible'})};
 for(const [key,value]of Object.entries(values)){saved.set(key,Object.getOwnPropertyDescriptor(global,key));Object.defineProperty(global,key,{value,writable:true,configurable:true});}
 const reads=[],writes=[],notices=[];let serverSaved=false,readError='',root;
 const api=(path,options={})=>{if(!options.method){reads.push(path);return readError?Promise.reject(Error(readError)):Promise.resolve({bookmarked:serverSaved});}const pending=deferred();writes.push({path,...options,...pending});return pending.promise;};
 const Component=load('src/app/components/BookmarkButton.tsx',{'../lib/api':{api},'../context/AuthContext':{useAuth:()=>({user:{id:1},loading:false})},'react-router-dom':{useNavigate:()=>()=>{}},'../lib/feedback':{notify:{success:message=>notices.push({kind:'success',message}),error:message=>notices.push({kind:'error',message})}}}).BookmarkButton;
 await act(async()=>{root=create(React.createElement(Component,{id:1}));});
 return {root,reads,writes,notices,setSaved:value=>serverSaved=value,setReadError:value=>readError=value,button:()=>root.root.findAllByType('button')[0],retry:()=>root.root.findAllByType('button').find(button=>button.children.includes('重试')),
  rerender:id=>act(async()=>root.update(React.createElement(Component,{id}))),
  close:async()=>{await act(async()=>root.unmount());for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(global,key,descriptor);else delete global[key];}},
 };
}

test('bookmark mutation retry keeps its original idempotent intent even after refreshed server state changed',async()=>{
 const f=await bookmarkFixture();try{
  await act(async()=>{f.button().props.onClick();f.button().props.onClick();});assert.equal(f.writes.length,1);assert.equal(f.writes[0].method,'PUT');assert.equal(f.button().props['aria-busy'],true);
  f.setSaved(true);await act(async()=>f.writes[0].reject(Error('response lost')));
  assert.equal(f.button().props['aria-pressed'],true,'follow-up read discovers the committed server state');assert.equal(f.notices.filter(n=>n.kind==='success').length,0);
  await act(async()=>f.retry().props.onClick());assert.equal(f.writes.length,2);assert.equal(f.writes[1].method,'PUT','retry must not toggle a possibly committed PUT into DELETE');
  await act(async()=>f.writes[1].resolve({bookmarked:true}));assert.equal(f.retry(),undefined);assert.equal(f.notices.at(-1).kind,'success');
  await act(async()=>f.button().props.onClick());assert.equal(f.writes[2].method,'DELETE');
  f.setSaved(false);await act(async()=>f.writes[2].reject(Error('delete response lost')));
  await act(async()=>f.retry().props.onClick());assert.equal(f.writes[3].method,'DELETE');
  await act(async()=>f.writes[3].resolve({bookmarked:false}));assert.equal(f.retry(),undefined);assert.equal(f.button().props['aria-pressed'],false);
 }finally{await f.close();}
});

test('bookmark GET failure retries only the read, and changing article ignores late mutation results',async()=>{
 const f=await bookmarkFixture();try{
  f.setReadError('read offline');await act(async()=>window.dispatchEvent(new Event('focus')));
  assert(f.retry());const count=f.reads.length;f.setReadError('');await act(async()=>f.retry().props.onClick());
  assert.equal(f.reads.length,count+1);assert.equal(f.writes.length,0);assert.equal(f.retry(),undefined);
  await act(async()=>f.button().props.onClick());await f.rerender(2);const readCount=f.reads.length;
  await act(async()=>f.writes[0].resolve({bookmarked:true}));
  assert.equal(f.button().props['aria-pressed'],false);assert.equal(f.reads.length,readCount);assert.deepEqual(f.notices,[]);
 }finally{await f.close();}
});

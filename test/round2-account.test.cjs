const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
function load(file,imports){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('module','exports','require',code)(module,module.exports,name=>name.endsWith('.css')?{}:imports[name]||require(name));return module.exports;}
function deferred(){let resolve,reject;const promise=new Promise((ok,fail)=>{resolve=ok;reject=fail;});return {promise,resolve,reject};}
const text=node=>node.children.map(child=>typeof child==='string'?child:text(child)).join('');
async function fixture(name,initial='',options={}){
 const saved=new Map();for(const [key,value]of Object.entries({window:new EventTarget(),document:Object.assign(new EventTarget(),{visibilityState:'visible',activeElement:null})})){saved.set(key,Object.getOwnPropertyDescriptor(global,key));Object.defineProperty(global,key,{value,writable:true,configurable:true});}
 const reads=[],writes=[],notices=[],routes=[];let hold=Boolean(options.holdReads),root,route,changeRoute;
 const response=path=>{
  if(path==='/account/sessions')return {items:[{id:'current',browser:'Chrome',os:'Windows',current:true,first_seen:1792116000000,last_seen:1792116000000,expires_at:1792716000000},{id:'other',browser:'Firefox',os:'Linux',current:false,first_seen:1792116000000,last_seen:1792116000000,expires_at:1792716000000}]};
  if(path==='/bookmark-folders')return {items:[{id:0,name:'默认收藏夹',total:2},{id:1,name:'学习',total:2},{id:2,name:'生活',total:0}]};
  if(path==='/engagement/preferences')return {email_verified:true,comment_email:false,reply_email:false,history_enabled:true};
  const params=new URLSearchParams(path.split('?')[1]),page=Number(params.get('page')||1),label=params.get('kind')||params.get('search')||params.get('folder')||'all';
  if(path.startsWith('/engagement/notifications'))return {items:[{id:1,title:label+' notice',is_read:false,available:true,url:'/article/1',created_at:'2026-10-16'}],unread:1,page,pageSize:20,total:1};
  if(path.startsWith('/engagement/history'))return {items:[{post_id:page,title:'history '+page,progress:.5,updated_at:1792116000000}],total:90,page,pageSize:30};
  return {items:[{id:1,post_id:1,available:true,title:label+' bookmark',folder_id:Number(params.get('folder')||1),tags:[]},{id:2,post_id:2,available:true,title:'second bookmark',folder_id:1,tags:[]}],total:24,page,pageSize:12};
 };
 const api=(path,options={})=>{if(options.method){const d=deferred();writes.push({path,...options,...d});return d.promise;}const d=hold&&path!=='/engagement/preferences'&&path!=='/bookmark-folders'?deferred():null;reads.push({path,...options,pending:d});return d?d.promise:Promise.resolve(response(path));};
 function Shell(){const [params,setParams]=React.useState(()=>new URLSearchParams(initial));route=params.toString();const set=React.useCallback((value,options)=>setParams(current=>{const next=typeof value==='function'?value(current):value;routes.push({query:next.toString(),options});return new URLSearchParams(next);}),[]);changeRoute=value=>setParams(new URLSearchParams(value));return React.createElement(Component,{useParams:[params,set]});}
 let activeParams;
 function WithParams(props){activeParams=props.useParams;return React.createElement(Page);}
 const listQuery=load('src/app/lib/useAdminList.ts',{'react-router-dom':{useLocation:()=>({pathname:'/account/fixture',state:null})},'./usePageSearchParams':{usePageSearchParams:()=>activeParams},'./pageScroll':{paginationSelector:'nav.pagination',paginationState:(_nav,_path,state)=>state},'./api':{api}});
 const imports={
  '../lib/api':{api},'../lib/feedback':{notify:{success:message=>notices.push({kind:'success',message}),error:message=>notices.push({kind:'error',message})}},
  '../lib/useEngagement':{useEngagement:()=>true},'../context/AuthContext':{useAuth:()=>({user:{id:1}})},
  'react-router-dom':{Link:({to,children,...props})=>React.createElement('a',{...props,href:to},children),useSearchParams:()=>activeParams},
  '../lib/usePageSearchParams':{usePageSearchParams:()=>activeParams},'../lib/useAdminList':listQuery,
  '../components/ThemeSelect':{ThemeSelect:({children,...props})=>React.createElement('select',props,children)},
  '../components/ui/dialog':{Dialog:({open,children,...props})=>open?React.createElement('dialog',props,children):null,DialogContent:'div',DialogTitle:'h2',DialogDescription:'p'},
  '../components/ContentUI':{ContentSkeleton:()=>React.createElement('div',{'data-skeleton':true}),Pagination:({data,onPage})=>React.createElement('button',{'data-page':true,onClick:()=>onPage(data.page+1)},'next')},
  '../components/BlogCard':{BlogCard:({title})=>React.createElement('h2',{},title)},
 };
 const Page=load('src/app/pages/'+name+'.tsx',imports).default,Component=WithParams;
 await act(async()=>{root=create(React.createElement(Shell));});
 return {root,reads,writes,notices,routes,response,get route(){return route;},hold:()=>{hold=true;},navigate:value=>act(async()=>changeRoute(value)),
  button:label=>root.root.findAllByType('button').find(button=>text(button)===label),select:label=>root.root.findByProps({'aria-label':label}),
  allText:()=>text(root.root),close:async()=>{await act(async()=>root.unmount());for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(global,key,descriptor);else delete global[key];}},
 };
}

test('reselecting current notification category and bookmark folder on page two preserves page and requests',async()=>{
 for(const [name,initial,label,value]of[['NotificationsPage','kind=reply&page=2&keep=1','消息分类','reply'],['BookmarksPage','folder=1&page=2&keep=1','收藏夹','1']]){
  const f=await fixture(name,initial);try{const before=f.reads.length;await act(async()=>f.select(label).props.onValueChange(value));assert.equal(f.reads.length,before);assert.match(f.route,/page=2/);assert.match(f.route,/keep=1/);}finally{await f.close();}
 }
});

test('notification filter follows newest URL intent, aborts the old read and preserves context while loading',async()=>{
 const f=await fixture('NotificationsPage','kind=comment&page=2&keep=1');try{
  f.hold();await act(async()=>f.select('消息分类').props.onValueChange('reply'));const old=f.reads.findLast(r=>r.path.includes('kind=reply'));
  assert.match(f.route,/kind=reply/);assert.doesNotMatch(f.route,/page=/);assert.match(f.route,/keep=1/);assert.match(f.allText(),/comment notice/);assert.match(f.allText(),/正在更新通知/);
  await act(async()=>f.select('消息分类').props.onValueChange('approved'));const current=f.reads.findLast(r=>r.path.includes('kind=approved'));assert.equal(old.signal.aborted,true);
  await act(async()=>current.pending.resolve(f.response(current.path)));await act(async()=>old.pending.resolve(f.response(old.path)));
  assert.match(f.allText(),/approved notice/);assert.doesNotMatch(f.allText(),/reply notice/);
 }finally{await f.close();}
});

test('notification writes lock synchronously, acknowledge success only once and refresh the latest filter',async()=>{
 const f=await fixture('NotificationsPage');try{
  let pending;await act(async()=>{pending=f.button('全部已读').props.onClick();f.button('全部已读').props.onClick();});assert.equal(f.writes.length,1);assert.match(f.allText(),/标为已读/);assert.equal(f.notices.length,0);
  f.hold();await act(async()=>f.select('消息分类').props.onValueChange('reply'));
  await act(async()=>f.writes[0].resolve({ok:true}));assert.match(f.reads.at(-2).path,/kind=reply/);assert.match(f.allText(),/已标为已读/);
  const current=f.reads.findLast(r=>r.path.includes('kind=reply'));await act(async()=>current.pending.resolve(f.response(current.path)));await pending;
 }finally{await f.close();}
});

test('failed detail mark-read is handled and never stops navigation or clears the notification list',async()=>{
 const f=await fixture('NotificationsPage');try{
  const link=f.root.root.findAllByType('a').find(link=>link.props.href==='/article/1');assert(link);await act(async()=>link.props.onClick());
  await act(async()=>f.writes[0].reject(Error('read failed')));assert.match(f.allText(),/all notice/);assert.match(f.allText(),/read failed/);assert.equal(f.notices.at(-1).kind,'error');
 }finally{await f.close();}
});

test('reading-history pagination is restored from the URL and stale page results cannot overwrite it',async()=>{
 const f=await fixture('ReadingHistoryPage','page=2&keep=1');try{
  assert.match(f.allText(),/history 2/);f.hold();await act(async()=>f.button('下一页').props.onClick());const old=f.reads.findLast(r=>r.path.includes('/history?'));
  assert.match(f.route,/page=3/);assert.match(f.route,/keep=1/);await f.navigate('page=1&keep=1');const current=f.reads.findLast(r=>r.path.includes('/history?'));
  await act(async()=>current.pending.resolve(f.response(current.path)));await act(async()=>old.pending.resolve(f.response(old.path)));
  assert.match(f.allText(),/history 1/);assert.doesNotMatch(f.allText(),/history 3/);assert.equal(old.signal.aborted,true);
 }finally{await f.close();}
});

test('reading deletion preserves rows during pending/failure and removes only acknowledged content before slow refresh',async()=>{
 const f=await fixture('ReadingHistoryPage');try{
  await act(async()=>{f.button('删除').props.onClick({currentTarget:{}});f.button('删除').props.onClick({currentTarget:{}});});assert.equal(f.writes.length,1);assert.match(f.allText(),/history 1/);assert.match(f.allText(),/删除中/);
  await act(async()=>f.writes[0].reject(Error('delete failed')));assert.match(f.allText(),/history 1/);assert(f.button('删除'));
  f.hold();await act(async()=>f.button('删除').props.onClick({currentTarget:{}}));await act(async()=>f.writes[1].resolve({ok:true}));assert.doesNotMatch(f.allText(),/history 1/);assert.match(f.allText(),/从下一篇文章开始/);
 }finally{await f.close();}
});

test('clear-history confirmation locks during pending, preserves failed context and never writes before confirmation',async()=>{
 const f=await fixture('ReadingHistoryPage');try{
  await act(async()=>f.button('清空历史').props.onClick());assert.equal(f.writes.length,0);await act(async()=>{f.button('确认清空').props.onClick();f.button('确认清空').props.onClick();});assert.equal(f.writes.length,1);
  const dialog=f.root.root.findByType('dialog');await act(async()=>dialog.props.onOpenChange(false));assert(f.root.root.findByType('dialog'));
  await act(async()=>f.writes[0].reject(Error('clear failed')));assert.match(f.allText(),/clear failed/);assert(f.button('确认清空'));assert.match(f.allText(),/history 1/);
 }finally{await f.close();}
});

test('history preference feedback follows acknowledgement and unmounted writes never publish old feedback',async()=>{
 const f=await fixture('ReadingHistoryPage');let closed=false;try{
  const toggle=()=>f.root.root.findByType('input');await act(async()=>{toggle().props.onChange({target:{checked:false}});toggle().props.onChange({target:{checked:false}});});assert.equal(f.writes.length,1);assert.equal(toggle().props.checked,true);
  await f.close();closed=true;await act(async()=>f.writes[0].reject(Error('late failure')));assert.deepEqual(f.notices,[]);
 }finally{if(!closed)await f.close();}
});

test('bookmark removal keeps the real list mounted, locks duplicate writes and preserves failed content',async()=>{
 const f=await fixture('BookmarksPage');try{
  const remove=()=>f.root.root.findByProps({'aria-label':'取消收藏：all bookmark'});
  await act(async()=>{remove().props.onClick({currentTarget:{}});remove().props.onClick({currentTarget:{}});});assert.equal(f.writes.length,1);assert.match(f.allText(),/all bookmark/);assert.equal(f.root.root.findAllByProps({'data-skeleton':true}).length,0);
  await act(async()=>f.writes[0].reject(Error('remove failed')));assert.match(f.allText(),/all bookmark/);assert.equal(remove().props.disabled,false);await act(async()=>f.button('重新加载收藏').props.onClick());assert.doesNotMatch(f.allText(),/remove failed/);
  f.hold();await act(async()=>remove().props.onClick({currentTarget:{}}));await act(async()=>f.writes[1].resolve({bookmarked:false}));assert.doesNotMatch(f.allText(),/all bookmark/);assert.match(f.allText(),/second bookmark/);assert.match(f.allText(),/正在更新收藏/);
 }finally{await f.close();}
});

test('bookmark IME waits for composition end while preserving the existing debounced search trigger and URL context',async()=>{
 const f=await fixture('BookmarksPage','folder=1&page=2&keep=1');try{
  const input=()=>f.root.root.findByProps({type:'search'});const count=f.reads.length;
  await act(async()=>{input().props.onCompositionStart();input().props.onChange({target:{value:'zhong'}});});await act(async()=>new Promise(resolve=>setTimeout(resolve,350)));assert.equal(f.reads.length,count);
  await act(async()=>input().props.onCompositionEnd({currentTarget:{value:'中文'}}));await act(async()=>new Promise(resolve=>setTimeout(resolve,350)));
  assert.match(f.route,/folder=1/);assert.match(f.route,/keep=1/);assert.doesNotMatch(f.route,/page=/);assert.equal(new URLSearchParams(f.route).get('search'),'中文');assert.match(f.reads.findLast(r=>r.path.startsWith('/bookmarks?')).path,/search=%E4%B8%AD%E6%96%87/);
  await f.navigate('folder=2&search=返回&page=2');assert.equal(input().props.value,'返回');assert.equal(f.select('收藏夹').props.value,'2');
 }finally{await f.close();}
});

test('bookmark folder failure preserves the form and input, synchronous locking prevents duplicate folder creation',async()=>{
 const f=await fixture('BookmarksPage');try{
  await act(async()=>f.button('新建收藏夹').props.onClick());const input=()=>f.root.root.findAllByType('input').find(input=>input.props.maxLength===60);
  await act(async()=>input().props.onChange({target:{value:'保留名称'}}));await act(async()=>{f.button('确认保存').props.onClick();f.button('确认保存').props.onClick();});assert.equal(f.writes.length,1);assert.equal(JSON.parse(f.writes[0].body).name,'保留名称');assert.equal(input().props.disabled,true);
  await act(async()=>f.writes[0].reject(Error('folder failed')));assert.equal(input().props.value,'保留名称');assert(f.button('确认保存'));assert.match(f.allText(),/folder failed/);
 }finally{await f.close();}
});

test('bookmark move feedback keeps its original operation label and refreshes current folder after quick switching',async()=>{
 const f=await fixture('BookmarksPage','folder=1');try{
  await act(async()=>f.select('移动收藏：1 bookmark').props.onValueChange('2'));assert.match(f.allText(),/正在移动/);assert.doesNotMatch(f.allText(),/正在取消/);
  f.hold();await act(async()=>f.select('收藏夹').props.onValueChange('2'));const stale=f.reads.findLast(r=>r.path.startsWith('/bookmarks?'));
  await act(async()=>f.writes[0].resolve({ok:true}));const current=f.reads.findLast(r=>r.path.startsWith('/bookmarks?'));assert.match(current.path,/folder=2/);assert.equal(stale.signal.aborted,true);
  await act(async()=>current.pending.resolve(f.response(current.path)));await act(async()=>stale.pending.resolve({...f.response(stale.path),items:[{id:9,post_id:9,title:'stale',available:true}]}));assert.doesNotMatch(f.allText(),/stale/);
 }finally{await f.close();}
});


test('session revocation still requires confirmation, rejects duplicate writes and preserves failed context',async()=>{
 const f=await fixture('SessionsPage');try{
  await act(async()=>f.root.root.findByProps({'aria-label':'退出 Firefox Linux'}).props.onClick());assert.equal(f.writes.length,0);
  await act(async()=>{f.button('确认退出').props.onClick();f.button('确认退出').props.onClick();});assert.equal(f.writes.length,1);
  await act(async()=>f.root.root.findByType('dialog').props.onOpenChange(false));assert(f.button('正在退出…'));
  await act(async()=>f.writes[0].reject(Error('revoke failed')));assert(f.button('确认退出'));assert.match(f.allText(),/revoke failed/);assert.match(f.allText(),/Firefox/);
  f.hold();await act(async()=>f.button('确认退出').props.onClick());await act(async()=>f.writes[1].resolve({ok:true}));assert.equal(f.root.root.findAllByType('dialog').length,0);assert.doesNotMatch(f.allText(),/Firefox/);assert.match(f.allText(),/Chrome/);assert.match(f.allText(),/正在更新设备/);
 }finally{await f.close();}
});

test('session reads abort on unmount and late revocation errors cannot notify another page',async()=>{
 const f=await fixture('SessionsPage','',{holdReads:true});const read=f.reads[0];await f.close();assert.equal(read.signal.aborted,true);await act(async()=>read.pending.resolve(f.response(read.path)));
 const g=await fixture('SessionsPage');await act(async()=>g.root.root.findByProps({'aria-label':'退出 Firefox Linux'}).props.onClick());await act(async()=>g.button('确认退出').props.onClick());await g.close();await act(async()=>g.writes[0].reject(Error('late revoke failure')));assert.deepEqual(g.notices,[]);
});

test('a current-session acknowledgement alone triggers login navigation and no guessed success',async()=>{
 const f=await fixture('SessionsPage');try{
  const destinations=[];window.location={assign:value=>destinations.push(value)};await act(async()=>f.root.root.findByProps({'aria-label':'退出 Chrome Windows 当前会话'}).props.onClick());await act(async()=>f.button('确认退出').props.onClick());assert.deepEqual(destinations,[]);await act(async()=>f.writes[0].resolve({current:true}));assert.deepEqual(destinations,['/login']);assert.deepEqual(f.notices,[]);
 }finally{await f.close();}
});

test('notification sidebar invalidation reads acknowledged state immediately, ignores stale polls and clears identity snapshots',async()=>{
 const originalWindow=global.window,originalDocument=global.document;global.window=new EventTarget();global.document=Object.assign(new EventTarget(),{visibilityState:'visible'});
 const requests=[];let user={id:1,username:'one',role:'user'},root;
 const nav=({to,children,className,...props})=>React.createElement('a',{...props,href:to},children);
 const Component=load('src/app/components/AccountWorkspace.tsx',{'../lib/api':{api:(path,options)=>{const pending=deferred();requests.push({path,...options,...pending});return pending.promise;}},'../lib/useEngagement':{useEngagement:()=>true},'../lib/useOperations':{useOperations:()=>false},'../lib/usePublishing':{usePublishing:()=>false},'../context/AuthContext':{useAuth:()=>({user,logout:async()=>true})},'../context/ThemeContext':{ThemeToggle:'div'},'react-router-dom':{Link:nav,NavLink:nav,useNavigate:()=>()=>{}}}).AccountWorkspace;
 try{
  await act(async()=>{root=create(React.createElement(Component));});await act(async()=>requests[0].resolve({unread:3}));assert.equal(root.root.findAllByProps({'aria-label':'3 条未读'}).length,1);
  await act(async()=>window.dispatchEvent(new Event('mooncci:notifications-updated')));await act(async()=>window.dispatchEvent(new Event('mooncci:notifications-updated')));assert.equal(requests[1].signal.aborted,true);
  await act(async()=>requests[2].resolve({unread:0}));await act(async()=>requests[1].resolve({unread:9}));assert.equal(root.root.findAllByProps({'aria-label':'9 条未读'}).length,0);assert.equal(root.root.findAllByProps({'aria-label':'3 条未读'}).length,0);
  user={id:2,username:'two',role:'user'};await act(async()=>root.update(React.createElement(Component)));assert.equal(requests[2].signal.aborted,true);await act(async()=>root.unmount());assert.equal(requests[3].signal.aborted,true);root=null;
 }finally{if(root)await act(async()=>root.unmount());global.window=originalWindow;global.document=originalDocument;}
});

test('an acknowledged notification read invalidates the current sidebar even after its page unmounted',async()=>{
 const f=await fixture('NotificationsPage');const emitter=window;let events=0;emitter.addEventListener('mooncci:notifications-updated',()=>events++);
 await act(async()=>f.button('全部已读').props.onClick());const reads=f.reads.length;assert.equal(events,0);await f.close();const descriptor=Object.getOwnPropertyDescriptor(global,'window');Object.defineProperty(global,'window',{value:emitter,writable:true,configurable:true});
 try{await act(async()=>f.writes[0].resolve({ok:true}));assert.equal(events,1);assert.equal(f.reads.length,reads);assert.deepEqual(f.notices,[]);}finally{if(descriptor)Object.defineProperty(global,'window',descriptor);else delete global.window;}
});

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.children?text(node.children):'';
const media=(filename='image.png',status='active')=>({filename,display_name:filename==='image.png'?'测试图片':filename,alt_text:'原替代文本',url:'/api/uploads/'+filename,size:1024,size_text:'1 KB',uploaded_at:'2026-10-15T00:00:00Z',ext:'.png',mime:'image/png',width:800,height:600,status});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function clock(){let now=0,id=0;const pending=new Map();return {set:(fn,ms)=>{pending.set(++id,{fn,at:now+ms});return id;},clear:key=>pending.delete(key),tick:ms=>{now+=ms;for(const [key,item]of [...pending])if(item.at<=now){pending.delete(key);item.fn();}}};}
function load(api,confirm,notices,timers,pointer){
 const box=({children,...props})=>React.createElement('fixture-box',props,children),button=React.forwardRef(({asChild,variant,children,...props},ref)=>asChild?React.cloneElement(children,{...props,ref}):React.createElement('button',{...props,ref},children));
 const mocks={'../lib/api':{api},'../lib/confirmAction':{confirmAction:confirm},'../lib/feedback':{notify:{success:value=>notices.push({kind:'success',value}),error:value=>notices.push({kind:'error',value})}},'../lib/safeUrl':{safeImageSrc:value=>value||''},
  '../components/admin/AdminButton':{AdminButton:button},'../components/ui/dialog':{Dialog:box,DialogContent:box,DialogDescription:'p',DialogTitle:'h2'},
  '../components/ui/dropdown-menu':{DropdownMenu:box,DropdownMenuTrigger:box,DropdownMenuContent:box,DropdownMenuItem:'menuitem',DropdownMenuRadioGroup:({value,onValueChange,children})=>React.createElement('select',{value,onChange:onValueChange?event=>onValueChange(event.target.value):undefined},children),DropdownMenuRadioItem:({value,children})=>React.createElement('option',{value},children)},
  'lucide-react':Object.fromEntries(['ChevronDown','Image','RefreshCw','RotateCw','Trash2','Undo2','Upload','X','MoreHorizontal','ArrowDownWideNarrow','Check','CheckSquare','Square','ListFilter'].map(name=>[name,'svg']))};
 const module={exports:{}},code=ts.transpileModule(fs.readFileSync('src/app/pages/AdminMediaPage.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('exports','require','setTimeout','clearTimeout','window',code)(module.exports,name=>name.endsWith('.css')?{}:mocks[name]||require(name),timers.set,timers.clear,pointer.window);return module.exports.default;
}
async function fixture({items=[media()],total,handle,touch=false}={}){
 const calls=[],confirms=[],answers=[],notices=[],focuses=[],timers=clock();let store=structuredClone(items);
 const matches=query=>/\(hover:\s*hover\)|\(pointer:\s*fine\)/.test(query)?!touch:touch;
 const mediaQueries=new Map();const pointer={window:{matchMedia:query=>{if(!mediaQueries.has(query))mediaQueries.set(query,{media:query,matches:matches(query),listeners:new Set(),addEventListener(_type,listener){this.listeners.add(listener);},removeEventListener(_type,listener){this.listeners.delete(listener);}});return mediaQueries.get(query);}},set:value=>{touch=value;for(const item of mediaQueries.values()){item.matches=matches(item.media);for(const listener of item.listeners)listener({matches:item.matches,media:item.media});}}};
 const api=async(url,options={})=>{
  const call={url,method:options.method||'GET',body:options.body instanceof FormData?options.body:options.body?JSON.parse(options.body):undefined};calls.push(call);
  if(handle){const result=await handle(call);if(result!==undefined)return result;}
  const parsed=new URL(url,'https://local.invalid'),pathname=parsed.pathname;
  if(call.method==='GET'){const page=Number(parsed.searchParams.get('page')),status=parsed.searchParams.get('status'),rows=store.filter(item=>item.status===status);return {items:structuredClone(rows),total:total??rows.length,page,pageSize:50};}
  if(pathname==='/upload/image')return {url:'/api/uploads/uploaded.png'};
  if(pathname.startsWith('/upload/media/batch/')){const action=pathname.split('/').at(-1);if(action==='permanent')store=store.filter(item=>!call.body.filenames.includes(item.filename));else store=store.map(item=>call.body.filenames.includes(item.filename)?{...item,status:action==='restore'?'active':'trashed'}:item);return {message:'批量操作完成'};}
  const parts=pathname.split('/'),filename=decodeURIComponent(parts[3]),index=store.findIndex(item=>item.filename===filename);assert(index>=0,'unexpected media target '+url);let item=store[index];
  if(parts[4]==='rename')item={...item,filename:call.body.filename,url:'/api/uploads/'+call.body.filename};
  else if(parts[4]==='recompress')item={...item,filename:'compressed.webp',url:'/api/uploads/compressed.webp',ext:'.webp',mime:'image/webp',quality:call.body.quality,size:512,size_text:'512 B'};
  else if(parts[4]==='restore')item={...item,status:'active'};
  else if(parts[4]==='permanent'){store.splice(index,1);return {message:'彻底删除完成'};}
  else if(call.method==='DELETE')item={...item,status:'trashed'};
  else if(call.method==='PUT')item={...item,...call.body};else throw Error('Unexpected request '+JSON.stringify(call));
  store[index]=item;return structuredClone(item);
 };
 const Page=load(api,async message=>{confirms.push(message);assert(answers.length,'confirmation must be explicitly answered by the test');return answers.shift();},notices,timers,pointer);let root;
 await act(async()=>{root=create(React.createElement(Page),{createNodeMock:element=>({isConnected:true,focus(){focuses.push(element.props['aria-label']||element.type);},click(){}})});});
 const button=(label,scope=root.root)=>{const found=scope.findAllByType('button').find(node=>node.props['aria-label']===label||text(node)===label);assert(found,'missing button '+label);return found;};
 const input=label=>{const found=root.root.findAllByType('label').find(node=>text(node).startsWith(label));assert(found,'missing field '+label);return found.findByType('input');};
 const click=async(label,scope)=>act(async()=>button(label,scope).props.onClick());
 const menu=async label=>act(async()=>{const item=root.root.findAllByType('menuitem').find(node=>text(node)===label);assert(item,'missing menu item '+label);return item.props.onSelect();});
 const open=async(filename=store.find(item=>item.status==='active')?.filename||store[0]?.filename)=>act(async()=>root.root.findAllByType('button').find(node=>node.props.className==='media-detail-trigger'&&node.props['aria-label']===(store.find(item=>item.filename===filename).display_name||filename)).props.onClick({currentTarget:{isConnected:true,focus(){}}}));
 const edit=async(label,value)=>act(async()=>input(label).props.onChange({target:{value}}));
 const submit=async()=>act(async()=>{const save=button('保存显示信息');assert.equal(save.props.type,'submit');assert(root.root.findByProps({className:'media-detail-footer'}).findAllByType('button').includes(save));root.root.findByProps({className:'media-detail-form'}).props.onSubmit({preventDefault(){}});});
 const choose=async filename=>act(async()=>root.root.findByProps({'aria-label':'选择 '+(store.find(item=>item.filename===filename).display_name||filename)}).props.onChange());
 return {root,calls,confirms,answers,notices,focuses,timers,button,input,click,menu,open,edit,submit,choose,mediaQueries,setTouch:value=>act(async()=>pointer.set(value)),get store(){return store;},writes:()=>calls.filter(call=>call.method!=='GET'),close:()=>act(async()=>root.unmount())};
}

test('media search debounces for 300ms, resets pagination and ignores stale successes and failures',async()=>{
 const pending=[],f=await fixture({handle:call=>call.method==='GET'?new Promise((resolve,reject)=>pending.push({...call,resolve,reject})):undefined});
 try{
  const search=()=>f.root.root.findByProps({'aria-label':'搜索媒体文件'});
  await act(async()=>search().props.onChange({target:{value:'  最新图片  '}}));await act(async()=>f.timers.tick(299));assert.equal(pending.length,1);await act(async()=>f.timers.tick(1));assert.equal(pending.length,2);
  let query=new URL(pending[1].url,'https://local.invalid').searchParams;assert.equal(query.get('q'),'最新图片');assert.equal(query.get('page'),'1');assert.equal(query.get('pageSize'),'50');assert.equal(query.get('status'),'active');
  await act(async()=>pending[1].resolve({items:[media('new.png')],total:51,page:1}));await act(async()=>pending[0].resolve({items:[media('stale.png')],total:1,page:1}));assert.match(text(f.root.toJSON()),/new.png/);assert.doesNotMatch(text(f.root.toJSON()),/stale.png/);
  await f.click('下一页');assert.equal(new URL(pending[2].url,'https://local.invalid').searchParams.get('page'),'2');await act(async()=>search().props.onChange({target:{value:'另一个搜索'}}));await act(async()=>f.timers.tick(300));query=new URL(pending[3].url,'https://local.invalid').searchParams;assert.equal(query.get('page'),'1');assert.equal(query.get('q'),'另一个搜索');
  await act(async()=>pending[3].resolve({items:[media('final.png')],total:1,page:1}));await act(async()=>pending[2].reject(Error('过期分页错误')));assert.match(text(f.root.toJSON()),/final.png/);assert.doesNotMatch(text(f.root.toJSON()),/过期分页错误|new.png/);assert.equal(f.root.root.findAllByType('nav').length,0);
 }finally{await f.close();}
});

test('bottom save sends metadata before rename, updates URL and exposes the new filename for bulk selection',async()=>{
 const f=await fixture();try{
  await f.open();await f.edit('链接显示名','新的显示名');await f.edit('Alt 文本','新的无障碍说明');await f.edit('文件名','renamed.png');await f.submit();
  const writes=f.writes();assert.deepEqual(writes.map(({url,method})=>({url,method})),[{url:'/upload/media/image.png',method:'PUT'},{url:'/upload/media/image.png/rename',method:'PUT'}]);assert.deepEqual(writes[0].body,{display_name:'新的显示名',alt_text:'新的无障碍说明'});assert.deepEqual(writes[1].body,{filename:'renamed.png'});assert.equal(f.input('文件名').props.value,'renamed.png');assert.equal(f.root.root.findByProps({className:'media-detail-preview'}).findByType('img').props.src,'/api/uploads/renamed.png');assert.equal(f.root.root.findByProps({'aria-label':'选择 新的显示名'}).props.checked,false);
  await f.click('取消');await f.choose('renamed.png');f.answers.push(true);await f.click('删除到回收站');assert.deepEqual(f.writes().at(-1).body,{filenames:['renamed.png'],force:false});
 }finally{await f.close();}
});

test('same filename saves metadata without rename; failed metadata preserves every input and retries',async()=>{
 let fail=true;const f=await fixture({items:[media('原图 space.png')],handle:call=>{if(call.method==='PUT'&&!call.url.endsWith('/rename')&&fail)throw Error('显示信息暂时无法保存');}});try{
  await f.open('原图 space.png');await f.edit('链接显示名','保留名称');await f.edit('Alt 文本','保留说明');await f.submit();assert.equal(f.input('链接显示名').props.value,'保留名称');assert.equal(f.input('Alt 文本').props.value,'保留说明');assert.equal(f.input('文件名').props.value,'原图 space.png');assert.match(text(f.root.toJSON()),/显示信息暂时无法保存/);assert.equal(f.button('保存显示信息').props.disabled,false);assert.equal(f.writes().length,1);assert.equal(f.writes()[0].url,'/upload/media/'+encodeURIComponent('原图 space.png'));
  fail=false;await f.submit();assert.equal(f.writes().length,2);assert(f.writes().every(call=>!call.url.endsWith('/rename')));assert.equal(f.store[0].display_name,'保留名称');assert.equal(f.store[0].alt_text,'保留说明');assert(f.notices.some(note=>note.kind==='success'&&note.value==='媒体信息已保存'));
 }finally{await f.close();}
});

test('rename failure reports partial success, keeps typed fields, and retries the two endpoints',async()=>{
 let fail=true;const f=await fixture({handle:call=>{if(call.url.endsWith('/rename')&&fail)throw Error('目标文件名冲突');}});try{
  await f.open();await f.edit('链接显示名','已存名称');await f.edit('Alt 文本','已存说明');await f.edit('文件名','retry.png');await f.submit();assert.match(text(f.root.toJSON()),/显示信息已保存，文件名修改失败：目标文件名冲突/);assert.equal(f.store[0].display_name,'已存名称');assert.equal(f.store[0].filename,'image.png');assert.equal(f.input('文件名').props.value,'retry.png');assert.equal(f.input('Alt 文本').props.value,'已存说明');assert.equal(f.root.root.findByProps({'aria-label':'选择 已存名称'}).props.checked,false);
  fail=false;await f.submit();assert.deepEqual(f.writes().map(call=>call.url),['/upload/media/image.png','/upload/media/image.png/rename','/upload/media/image.png','/upload/media/image.png/rename']);assert.equal(f.input('文件名').props.value,'retry.png');assert.equal(f.store[0].filename,'retry.png');assert(f.notices.some(note=>note.kind==='success'&&/文件名已修改/.test(note.value)));
 }finally{await f.close();}
});

test('in-flight metadata save disables actions and rejects a duplicate form submission',async()=>{
 const pending=deferred();let first=true;const f=await fixture({handle:call=>{if(call.method==='PUT'&&first){first=false;return pending.promise;}}});try{
  await f.open();await f.edit('链接显示名','等待保存');await f.submit();assert.equal(f.button('保存显示信息').props.disabled,true);assert.equal(f.root.root.findByProps({className:'media-detail-fields'}).props.disabled,true);await f.submit();assert.equal(f.writes().length,1);await act(async()=>pending.resolve({...media(),display_name:'等待保存'}));assert.equal(f.button('保存显示信息').props.disabled,false);assert.equal(f.input('链接显示名').props.value,'等待保存');
 }finally{await f.close();}
});

test('single deletion requires confirmation and a separate explicit 409 force confirmation',async()=>{
 const f=await fixture({handle:call=>{if(call.method==='DELETE'&&!call.url.includes('force=1'))throw Object.assign(Error('该图片有文章引用'),{status:409});}});try{
  await f.open();f.answers.push(false);await f.click('删除到回收站');assert.equal(f.writes().length,0);assert.equal(f.confirms[0],'确定将这个文件移入回收站？');
  f.answers.push(true,false);await f.click('删除到回收站');assert.equal(f.writes().length,1);assert(!f.writes()[0].url.includes('force=1'));assert.match(f.confirms.at(-1),/该图片有文章引用[\s\S]*强制删除会让文章里的图片链接失效/);assert(f.root.root.findByProps({className:'media-detail-form'}));
  f.answers.push(true,true);await f.click('删除到回收站');assert.deepEqual(f.writes().map(call=>call.url),['/upload/media/image.png','/upload/media/image.png','/upload/media/image.png?force=1']);assert.equal(f.root.root.findAllByProps({className:'media-detail-form'}).length,0);assert.equal(f.store[0].status,'trashed');assert(f.notices.some(note=>note.value==='媒体文件已移入回收站'));
 }finally{await f.close();}
});

test('recompression sends chosen quality and exposes its new URL and filename for bulk selection',async()=>{
 const f=await fixture();try{
  await f.open();const select=f.root.root.findByProps({className:'media-compression-actions'}).findByType('select');await act(async()=>select.props.onChange({target:{value:'high'}}));await f.click('二次压缩');assert.deepEqual(f.writes()[0],{url:'/upload/media/image.png/recompress',method:'POST',body:{quality:'high'}});assert.equal(f.input('文件名').props.value,'compressed.webp');assert.equal(f.root.root.findByProps({className:'media-detail-preview'}).findByType('img').props.src,'/api/uploads/compressed.webp');assert.equal(f.root.root.findByProps({'aria-label':'选择 测试图片'}).props.checked,false);
  await f.click('取消');await f.choose('compressed.webp');f.answers.push(true);await f.click('删除到回收站');assert.deepEqual(f.writes().at(-1).body.filenames,['compressed.webp']);
 }finally{await f.close();}
});

test('active batch selection, clear/select-all, guarded force delete and trash restore keep API contracts',async()=>{
 let conflict=true;const f=await fixture({items:[media(),media('second.png')],handle:call=>{if(call.url==='/upload/media/batch/delete'&&!call.body.force&&conflict)throw Object.assign(Error('所选图片仍有引用'),{status:409});}});try{
  await f.choose('image.png');await f.click('全选本页');assert.equal(f.root.root.findAllByType('input').filter(node=>node.props.type==='checkbox'&&node.props.checked).length,2);await f.click('清空选择');assert.equal(f.root.root.findAllByProps({'aria-label':'批量媒体操作'}).length,0);await f.choose('image.png');await f.click('全选本页');
  f.answers.push(false);await f.click('删除到回收站');assert.equal(f.writes().length,0);f.answers.push(true,true);await f.click('删除到回收站');assert.deepEqual(f.writes().map(call=>call.body),[{filenames:['image.png','second.png'],force:false},{filenames:['image.png','second.png'],force:true}]);assert.equal(f.root.root.findAllByProps({'aria-label':'批量媒体操作'}).length,0);
  const trash=f.root.root.findAllByType('button').find(node=>node.props['aria-pressed']!==undefined&&text(node).startsWith('回收站'));await act(async()=>trash.props.onClick());assert(new URL(f.calls.at(-1).url,'https://local.invalid').searchParams.get('status')==='trashed');await f.choose('image.png');await f.menu('全选本页');const confirms=f.confirms.length;await f.click('恢复');assert.equal(f.confirms.length,confirms);assert.equal(f.writes().at(-1).url,'/upload/media/batch/restore');assert.deepEqual(f.writes().at(-1).body,{filenames:['image.png','second.png']});assert(f.store.every(item=>item.status==='active'));
 }finally{await f.close();}
});

test('trash detail forbids rename/recompression, restores singly and guards permanent batch deletion',async()=>{
 const f=await fixture({items:[media('trash.png','trashed'),media('other.png','trashed')]});try{
  await act(async()=>f.root.root.findAllByType('button').find(node=>text(node).startsWith('回收站')).props.onClick());await f.open('trash.png');assert.equal(f.input('文件名').props.readOnly,true);assert.equal(f.root.root.findAllByType('button').filter(node=>text(node)==='二次压缩').length,0);await f.edit('链接显示名','回收站显示名');await f.submit();assert.equal(f.writes().length,1);assert.equal(f.writes()[0].url,'/upload/media/trash.png');assert(f.writes().every(call=>!call.url.endsWith('/rename')));await f.click('恢复');assert.equal(f.writes().at(-1).url,'/upload/media/trash.png/restore');assert.equal(f.store.find(item=>item.filename==='trash.png').status,'active');
  await f.choose('other.png');f.answers.push(false);const before=f.writes().length;await f.menu('彻底删除');assert.equal(f.writes().length,before);f.answers.push(true);await f.menu('彻底删除');assert.equal(f.writes().at(-1).url,'/upload/media/batch/permanent');assert.deepEqual(f.writes().at(-1).body,{filenames:['other.png']});assert.match(f.confirms.at(-1),/彻底删除选中的 1 个文件.*不可恢复/);assert.equal(f.root.root.findAllByProps({'aria-label':'批量媒体操作'}).length,0);
 }finally{await f.close();}
});

test('general media upload accepts a 6MB image, sends quality and leaves the 12MB size limit to the backend',async()=>{
 let reject=false;const f=await fixture({handle:call=>{if(call.url==='/upload/image'&&reject)throw Object.assign(Error('图片不能超过 12 MB'),{status:413});}});try{
  const quality=f.root.root.findByProps({className:'media-page-actions'}).findByType('select');await act(async()=>quality.props.onChange({target:{value:'original'}}));const upload=()=>f.root.root.findByProps({'aria-label':'上传图片文件'}),file=new File([new Uint8Array(6*1024*1024)],'six-meg.png',{type:'image/png'});
  await act(async()=>upload().props.onChange({target:{files:[file],value:'six-meg.png'}}));assert.equal(f.writes().length,1);assert.equal(f.writes()[0].url,'/upload/image');assert.equal(f.writes()[0].body.get('quality'),'original');assert.equal(f.writes()[0].body.get('image').size,6*1024*1024);assert.equal(f.notices.some(note=>note.kind==='error'),false);
  reject=true;await act(async()=>upload().props.onChange({target:{files:[new File([new Uint8Array(13*1024*1024)],'large.png',{type:'image/png'})],value:'large.png'}}));assert.equal(f.writes().length,2);assert.match(text(f.root.toJSON()),/图片不能超过 12 MB/);assert.equal(f.button('上传图片').props.disabled,false);
 }finally{await f.close();}
});

test('an upload finishing under an old query cannot invalidate the current pending search request',async()=>{
 const upload=deferred(),search=deferred();const f=await fixture({handle:call=>{if(call.url==='/upload/image')return upload.promise;if(call.method==='GET'&&new URL(call.url,'https://local.invalid').searchParams.get('q')==='current')return search.promise;}});try{
  await act(async()=>f.root.root.findByProps({'aria-label':'上传图片文件'}).props.onChange({target:{files:[new File(['pixels'],'upload.png',{type:'image/png'})],value:'upload.png'}}));
  await act(async()=>f.root.root.findByProps({'aria-label':'搜索媒体文件'}).props.onChange({target:{value:'current'}}));await act(async()=>f.timers.tick(300));assert.equal(f.calls.filter(call=>call.method==='GET').length,2);
  await act(async()=>upload.resolve({url:'/api/uploads/uploaded.png'}));assert.equal(f.calls.filter(call=>call.method==='GET').length,2,'the stale upload closure must not start a list request or supersede the pending search');
  await act(async()=>search.resolve({items:[media('current.png')],total:1,page:1}));assert.match(text(f.root.toJSON()),/current.png/);assert.doesNotMatch(text(f.root.toJSON()),/正在加载媒体库/);
 }finally{await f.close();}
});

test('recompression preserves unsaved display, alt and rename inputs and saves them against the new filename',async()=>{
 const f=await fixture();try{
  await f.open();await f.edit('链接显示名','尚未保存的显示名');await f.edit('Alt 文本','尚未保存的替代文本');await f.edit('文件名','custom.webp');await f.click('二次压缩');assert.equal(f.input('链接显示名').props.value,'尚未保存的显示名');assert.equal(f.input('Alt 文本').props.value,'尚未保存的替代文本');assert.equal(f.input('文件名').props.value,'custom.webp');assert.equal(f.store[0].filename,'compressed.webp');assert.equal(f.store[0].display_name,'测试图片');
  await f.submit();assert.deepEqual(f.writes().map(call=>call.url),['/upload/media/image.png/recompress','/upload/media/compressed.webp','/upload/media/compressed.webp/rename']);assert.deepEqual(f.writes()[1].body,{display_name:'尚未保存的显示名',alt_text:'尚未保存的替代文本'});assert.deepEqual(f.writes()[2].body,{filename:'custom.webp'});assert.equal(f.store[0].filename,'custom.webp');
 }finally{await f.close();}
});

test('cancelled batch force and failed batch delete re-read partial results, trim selection and never retry a write',async()=>{
 for(const status of [409,503]){
  let f;f=await fixture({items:[media(),media('remaining.png')],handle:call=>{if(call.url==='/upload/media/batch/delete'){f.store[0].status='trashed';throw Object.assign(Error('部分图片尚未处理'),{status});}}});try{
   await f.choose('image.png');await f.click('全选本页');f.answers.push(true);if(status===409)f.answers.push(false);const reads=f.calls.filter(call=>call.method==='GET').length;await f.click('删除到回收站');assert.equal(f.writes().length,1);assert.deepEqual(f.writes()[0].body,{filenames:['image.png','remaining.png'],force:false});assert.equal(f.calls.filter(call=>call.method==='GET').length,reads+1);assert.match(text(f.root.toJSON()),/部分图片尚未处理/);assert.doesNotMatch(text(f.root.toJSON()),/已选 2 项/);assert.match(text(f.root.toJSON()),/已选 1 项/);assert.equal(f.root.root.findByProps({'aria-label':'选择 remaining.png'}).props.checked,true);assert.equal(f.root.root.findAllByProps({'aria-label':'选择 测试图片'}).length,0);assert.equal(f.confirms.length,status===409?2:1);
  }finally{await f.close();}
 }
});

test('failed trash batch restore and permanent delete refresh server results and retain the error without replaying writes',async()=>{
 for(const action of ['restore','permanent']){
  let f;f=await fixture({items:[media('first.png','trashed'),media('remaining.png','trashed')],handle:call=>{if(call.url==='/upload/media/batch/'+action){if(action==='restore')f.store[0].status='active';else f.store.splice(0,1);throw Object.assign(Error('批量操作仅部分完成'),{status:503});}}});try{
   await act(async()=>f.root.root.findAllByType('button').find(node=>text(node).startsWith('回收站')).props.onClick());await f.choose('first.png');await f.menu('全选本页');if(action==='permanent')f.answers.push(true);const reads=f.calls.filter(call=>call.method==='GET').length;if(action==='restore')await f.click('恢复');else await f.menu('彻底删除');assert.equal(f.writes().length,1);assert.equal(f.writes()[0].url,'/upload/media/batch/'+action);assert.deepEqual(f.writes()[0].body,{filenames:['first.png','remaining.png']});assert.equal(f.calls.filter(call=>call.method==='GET').length,reads+1);assert.equal(new URL(f.calls.at(-1).url,'https://local.invalid').searchParams.get('status'),'trashed');assert.match(text(f.root.toJSON()),/批量操作仅部分完成/);assert.match(text(f.root.toJSON()),/已选 1 项/);assert.equal(f.root.root.findByProps({'aria-label':'选择 remaining.png'}).props.checked,true);assert.equal(f.root.root.findAllByProps({'aria-label':'选择 first.png'}).length,0);
  }finally{await f.close();}
 }
});

test('inline search clear immediately loads unfiltered page one, restores input focus and has no duplicate empty-state action',async()=>{
 const f=await fixture({total:51,handle:call=>{if(call.method==='GET'&&new URL(call.url,'https://local.invalid').searchParams.get('q')==='absent')return {items:[],total:0,page:1,pageSize:50};}});try{
  const search=()=>f.root.root.findByProps({'aria-label':'搜索媒体文件'}),clears=()=>f.root.root.findAllByType('button').filter(node=>node.props['aria-label']==='清除搜索');assert.equal(clears().length,0);
  await act(async()=>search().props.onChange({target:{value:'needle'}}));await act(async()=>f.timers.tick(299));assert.equal(f.calls.length,1);await act(async()=>f.timers.tick(1));assert.equal(new URL(f.calls.at(-1).url,'https://local.invalid').searchParams.get('q'),'needle');await f.click('下一页');assert.equal(new URL(f.calls.at(-1).url,'https://local.invalid').searchParams.get('page'),'2');assert.equal(clears().length,1);assert(f.root.root.findByProps({className:'media-search-field'}).findAllByType('button').includes(clears()[0]));
  const before=f.calls.length;await f.click('清除搜索');assert.equal(f.calls.length,before+1,'clear must request immediately, without advancing the debounce clock');const query=new URL(f.calls.at(-1).url,'https://local.invalid').searchParams;assert.equal(query.get('q'),'');assert.equal(query.get('page'),'1');assert.equal(query.get('status'),'active');assert.equal(search().props.value,'');assert.equal(clears().length,0);assert.equal(f.focuses.at(-1),'搜索媒体文件');await act(async()=>f.timers.tick(300));assert.equal(f.calls.length,before+1,'the cleared keyword timer must not trigger a duplicate request');
  await act(async()=>search().props.onChange({target:{value:'absent'}}));await act(async()=>f.timers.tick(300));assert.match(text(f.root.toJSON()),/没有找到匹配的媒体文件/);assert.equal(clears().length,1);assert.equal(f.root.root.findAllByType('button').filter(node=>text(node)==='清除搜索').length,0,'the empty state must not add a second clear action');await f.click('清除搜索');assert.equal(search().props.value,'');assert.equal(clears().length,0);assert.equal(f.focuses.at(-1),'搜索媒体文件');
 }finally{await f.close();}
});

test('one native refresh button lives in the filter toolbar, disables during loading and issues one request per refresh',async()=>{
 const pending=[],f=await fixture({handle:call=>call.method==='GET'?new Promise(resolve=>pending.push({...call,resolve})):undefined});try{
  const refresh=()=>f.root.root.findAllByType('button').filter(node=>node.props['aria-label']==='刷新媒体库');assert.equal(refresh().length,1);assert.equal(refresh()[0].props.className,'media-refresh');assert(f.root.root.findByProps({className:'media-page-toolbar'}).findAllByType('button').includes(refresh()[0]));assert.equal(f.root.root.findAllByProps({className:'media-status-row'}).length,0);assert.equal(refresh()[0].props.disabled,true);assert.equal(pending.length,1);
  await act(async()=>f.timers.tick(300));assert.equal(pending.length,1,'loading with an unchanged keyword must not add API requests');await act(async()=>pending[0].resolve({items:[media()],total:1,page:1,pageSize:50}));assert.equal(refresh()[0].props.disabled,false);await f.click('刷新媒体库');assert.equal(refresh().length,1);assert.equal(refresh()[0].props.disabled,true);assert.equal(pending.length,2);const query=new URL(pending[1].url,'https://local.invalid').searchParams;assert.equal(query.get('q'),'');assert.equal(query.get('page'),'1');assert.equal(query.get('status'),'active');await act(async()=>f.timers.tick(300));assert.equal(pending.length,2,'the disabled native refresh must not cause another request');
  await act(async()=>pending[1].resolve({items:[media('refreshed.png')],total:1,page:1,pageSize:50}));assert.equal(refresh()[0].props.disabled,false);assert.match(text(f.root.toJSON()),/refreshed.png/);
 }finally{await f.close();}
});

test('manual selection makes thumbnail clicks toggle only; Done and query changes clear the mode and selection',async()=>{
 const f=await fixture({items:[media(),media('second.png')],total:51});try{
  const checked=()=>f.root.root.findAllByType('input').filter(node=>node.props.type==='checkbox'&&node.props.checked),details=()=>f.root.root.findAllByProps({className:'media-detail-form'}),overlays=()=>f.root.root.findAllByProps({className:'media-card-actions'});
  assert.equal(overlays().length,2);await f.setTouch(true);await f.click('选择');assert(f.button('完成'));assert.equal(overlays().length,0);assert.equal(checked().length,0);
  await f.open('image.png');assert.equal(checked().length,1);assert.equal(details().length,0,'a thumbnail must select rather than open detail during selection mode');await f.open('image.png');assert.equal(checked().length,0);assert(f.button('完成'),'manual selection must stay active after deselecting its last item');assert.equal(overlays().length,0);
  await f.open('second.png');await f.click('完成');assert.equal(checked().length,0);assert(f.button('选择'));await f.setTouch(false);assert.equal(overlays().length,2);await f.open('image.png');assert.equal(details().length,1);await f.click('取消');
  await f.setTouch(true);await f.click('选择');await f.open('image.png');await act(async()=>f.root.root.findByProps({'aria-label':'搜索媒体文件'}).props.onChange({target:{value:'filter'}}));await act(async()=>f.timers.tick(300));assert.equal(checked().length,0);assert(f.button('选择'));assert.equal(overlays().length,0);assert.equal(new URL(f.calls.at(-1).url,'https://local.invalid').searchParams.get('q'),'filter');
  await f.click('选择');await f.open('image.png');await f.click('下一页');assert.equal(checked().length,0);assert(f.button('选择'));await f.click('选择');await f.open('image.png');await act(async()=>f.root.root.findAllByType('button').find(node=>node.props['aria-pressed']!==undefined&&text(node).startsWith('回收站')).props.onClick());assert.equal(checked().length,0);assert.equal(f.root.root.findAllByType('button').filter(node=>text(node)==='完成').length,0);assert.equal(f.writes().length,0);
 }finally{await f.close();}
});

test('touch capability removes card overlays, keeps normal detail access and reacts to matchMedia changes',async()=>{
 const f=await fixture({items:[media(),media('second.png')],touch:true});try{
  const overlays=()=>f.root.root.findAllByProps({className:'media-card-actions'});assert.equal(overlays().length,0);await f.open('image.png');assert.equal(f.root.root.findAllByProps({className:'media-detail-form'}).length,1);await f.click('取消');await f.click('选择');await f.open('image.png');assert.equal(f.root.root.findAllByProps({className:'media-detail-form'}).length,0);assert.equal(f.root.root.findByProps({'aria-label':'选择 测试图片'}).props.checked,true);await f.click('完成');assert.equal(f.root.root.findByProps({'aria-label':'选择 测试图片'}).props.checked,false);assert.equal(overlays().length,0);
  assert(f.mediaQueries.size>0);await f.setTouch(false);assert.equal(overlays().length,2);await f.setTouch(true);assert.equal(overlays().length,0);assert.equal(f.writes().length,0);
 }finally{await f.close();for(const query of f.mediaQueries.values())assert.equal(query.listeners.size,0,'capability listeners must be removed on unmount');}
});

test('desktop checkbox selection suppresses overlays and thumbnail clicks toggle instead of opening details',async()=>{
 const f=await fixture({items:[media(),media('second.png')]});try{
  const overlays=()=>f.root.root.findAllByProps({className:'media-card-actions'});assert.equal(overlays().length,2);assert.equal(f.root.root.findAllByProps({className:'media-selection-toggle'}).length,0);await f.choose('image.png');assert.equal(overlays().length,0);await f.open('second.png');assert.equal(f.root.root.findByProps({'aria-label':'选择 second.png'}).props.checked,true);assert.equal(f.root.root.findAllByProps({className:'media-detail-form'}).length,0);await f.open('image.png');await f.open('second.png');assert.equal(overlays().length,2,'automatic selection mode ends after its final checkbox is cleared');await f.open('image.png');assert.equal(f.root.root.findAllByProps({className:'media-detail-form'}).length,1);assert.equal(f.writes().length,0);
 }finally{await f.close();}
});

test('media selection keeps native checkboxes and renders the checked mark as an aria-hidden SVG',async()=>{
 const f=await fixture({items:[media(),media('second.png')]});try{
  await f.choose('image.png');const labels=f.root.root.findAllByProps({className:'media-file-select'});assert.equal(labels.length,2);
  const checked=labels[0].findByType('input'),unchecked=labels[1].findByType('input');assert.equal(checked.props.type,'checkbox');assert.equal(checked.props.checked,true);assert.equal(unchecked.props.type,'checkbox');assert.equal(unchecked.props.checked,false);assert.equal(checked.props['aria-label'],'选择 测试图片');
  const circle=labels[0].findByType('span'),icon=circle.findByType('svg');assert.equal(circle.props['aria-hidden'],'true');assert.equal(icon.props.strokeWidth,2.5);assert.equal(text(circle),'');assert.equal(text(labels[1].findByType('span')),'');assert.equal(f.writes().length,0);
 }finally{await f.close();}
});

for (const touch of [false,true]) test(`unified ${touch?'touch':'desktop'} batch bar exposes four primary items and keeps original delete/restore/permanent guards`,async()=>{
 const f=await fixture({items:[media(),media('second.png'),media('trash.png','trashed'),media('older.png','trashed')],touch});try{
  const actions=()=>f.root.root.findByProps({className:'media-batch-actions'}),primary=()=>actions().findAllByType('button'),select=filename=>touch?f.open(filename):f.choose(filename);if(touch)await f.click('选择');await select('image.png');assert.equal(f.root.root.findAllByProps({role:'status'}).length,1,'one shared live selection status');assert.equal(f.root.root.findAllByProps({className:'media-batch-desktop'}).length,0);assert.equal(primary().length,3);assert.equal(actions().findAllByProps({role:'status'}).length,1);assert.deepEqual(primary().map(node=>node.props['aria-label']||text(node)),['清空选择','全选本页','删除到回收站']);
  await f.click('清空选择',actions());assert.equal(f.root.root.findAllByProps({className:'media-batch-actions'}).length,0);if(touch)assert(f.button('完成'),'clearing selected filenames must preserve explicit manual selection mode');await select('image.png');await f.click('全选本页',actions());assert.equal(f.button('全选本页',actions()).props.disabled,true);assert.match(text(actions()),/已选 2 项/);f.answers.push(false);await f.click('删除到回收站',actions());assert.equal(f.writes().length,0);f.answers.push(true);await f.click('删除到回收站',actions());assert.deepEqual(f.writes()[0],{url:'/upload/media/batch/delete',method:'POST',body:{filenames:['image.png','second.png'],force:false}});
  await act(async()=>f.root.root.findAllByType('button').find(node=>node.props['aria-pressed']!==undefined&&text(node).startsWith('回收站')).props.onClick());if(touch)await f.click('选择');await select('trash.png');assert.equal(primary().length,3);assert.equal(actions().findAllByProps({role:'status'}).length,1);assert.deepEqual(primary().map(node=>node.props['aria-label']||text(node)),['清空选择','恢复','更多批量操作']);
  const confirms=f.confirms.length;await f.click('恢复',actions());assert.equal(f.confirms.length,confirms);assert.equal(f.writes().at(-1).url,'/upload/media/batch/restore');assert.deepEqual(f.writes().at(-1).body,{filenames:['trash.png']});assert.equal(f.store.find(item=>item.filename==='trash.png').status,'active');await select('older.png');
  const menu=()=>actions().findAllByType('menuitem');assert.deepEqual(menu().map(text),['全选本页','彻底删除']);await act(async()=>menu()[0].props.onSelect());assert.match(text(actions()),/已选 3 项/);assert.equal(menu()[0].props.disabled,true);f.answers.push(false);await act(async()=>menu()[1].props.onSelect());assert.equal(f.writes().length,2);await act(async()=>f.timers.tick(0));assert.equal(f.focuses.at(-1),'更多批量操作','Cancelled permanent delete restores the connected More trigger');f.answers.push(true);await act(async()=>menu()[1].props.onSelect());assert.equal(f.writes().at(-1).url,'/upload/media/batch/permanent');assert.deepEqual([...f.writes().at(-1).body.filenames].sort(),['image.png','older.png','second.png']);assert.equal(f.confirms.at(-1),'确定彻底删除选中的 3 个文件？这一步不可恢复。');assert.equal(f.root.root.findAllByProps({className:'media-batch-actions'}).length,0);
 }finally{await f.close();}
});

test('sort dropdown exposes only the existing recent-update order without adding unsupported API parameters',async()=>{
 const f=await fixture();try{
  const toolbar=f.root.root.findByProps({className:'media-page-toolbar'}),sort=toolbar.findByType('select');assert.equal(sort.props.value,'updated');assert.deepEqual(sort.findAllByType('option').map(node=>({value:node.props.value,text:text(node)})),[{value:'updated',text:'最近更新'}]);assert.equal(sort.props.onChange,undefined);assert.equal(f.root.root.findAllByType('button').filter(node=>node.props.className==='media-sort-trigger').length,1);await act(async()=>f.timers.tick(300));assert.equal(f.calls.length,1);assert.deepEqual([...new URL(f.calls[0].url,'https://local.invalid').searchParams.keys()].sort(),['page','pageSize','q','status']);
 }finally{await f.close();}
});

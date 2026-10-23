const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
const articleUrl={};new Function('exports',ts.transpileModule(fs.readFileSync('src/app/lib/articleUrl.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(articleUrl);
function load(file,api,role='owner',confirm=async()=>true,extra={}){
 const mod={exports:{}},box=({children,...props})=>React.createElement('box',props,children);
 const button=({asChild,children,...props})=>asChild?React.cloneElement(children,props):React.createElement('button',props,children);
 const mocks={
  'react-router-dom':{Link:({to,children,...props})=>React.createElement('a',{href:to,...props},children)},
  'lucide-react':{MoreHorizontal:'svg'},'react-dom':{createPortal:children=>React.createElement('import-host',null,children)},
  '../lib/articleUrl':articleUrl,
  '../lib/api':{api},'../lib/feedback':{notify:{success(){},error(){}}},'../lib/confirmAction':{confirmAction:confirm},
  '../context/AuthContext':{useAuth:()=>({user:{role}})},'../components/ArticleImport':{ArticleImport:()=>React.createElement('details',null,'import fixture')},
  '../components/admin/AdminButton':{AdminButton:button},'../components/ui/skeleton':{Skeleton:'skeleton'},
  '../components/ui/dialog':{Dialog:box,DialogContent:box,DialogTitle:'h3',DialogTrigger:box},
  '../components/ui/dropdown-menu':{DropdownMenu:box,DropdownMenuTrigger:box,DropdownMenuContent:box,DropdownMenuItem:'menuitem'},
  '../components/AdminPagination':{AdminPagination:box},'../components/ThemeSelect':{ThemeSelect:props=>React.createElement('select',props,props.children)},
 };
 Object.assign(mocks,extra);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('exports','require','document',code)(mod.exports,name=>name.endsWith('.css')?{}:mocks[name]||require(name),{createElement:()=>({querySelector:()=>null})});return mod.exports.default;
}
const text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.children?text(node.children):'';
const draft=(id,post_id=null)=>({id,post_id,version:7,updated_at:'2026-10-15T00:00:00Z',payload:{title:id}});
const post=(id,status='published',has_unpublished=0)=>({id,title:'文章'+id,summary:'摘要'+id,category:'分类',author_name:'作者',status,has_unpublished});
const file=process.env.ADMIN_POSTS_TEST_SOURCE||'src/app/pages/AdminPostsPage.tsx';
function changeFilter(root,value){const button=root.root.findAllByType('button').find(b=>b.props['aria-pressed']!==undefined&&text(b).startsWith(value==='draft'?'草稿':value==='all'?'全部':'已发布'));if(button)button.props.onClick();else root.root.findByType('select').props.onValueChange(value);}

test('late previous-filter responses cannot replace either posts or drafts',async()=>{
 const pending=[];const Page=load(file,url=>new Promise(resolve=>pending.push({url,resolve})));let root;
 try{
  await act(async()=>{root=create(React.createElement(Page));});
  await act(async()=>changeFilter(root,'draft'));
  assert.equal(pending.length,4);
  await act(async()=>{pending[2].resolve({items:[post(2,'draft')],total:1,page:1});pending[3].resolve({items:[draft('新草稿')],total:1,page:1});});
  assert.match(text(root.toJSON()),/新草稿/);
  await act(async()=>{pending[0].resolve({items:[post(1)],total:1,page:1});pending[1].resolve({items:[draft('过期草稿')],total:1,page:1});});
  assert.match(text(root.toJSON()),/新草稿/);assert.doesNotMatch(text(root.toJSON()),/过期草稿|文章1/);
 }finally{root?.unmount();}
});

test('only full unique data gets counts; linked drafts do not duplicate rows or imply unpublished edits',async()=>{
 let phase=0;const calls=[];const Page=load(file,async url=>{calls.push(url);return url.startsWith('/admin/posts')?{items:[post(1),post(2,'draft',1)],total:2,page:1}:{items:phase?[draft('独立'),draft('关联',1)]:[draft('独立')],total:phase?2:21,page:1};});let root;
 try{
  await act(async()=>{root=create(React.createElement(Page));});
  assert.equal(root.root.findAll(n=>n.props.className==='admin-posts-filter-count').length,0);
  assert.doesNotMatch(text(root.toJSON()),/共 3 篇/);
  assert.equal(root.root.findAllByType('nav').length,0);assert.match(text(root.toJSON()),/已显示 3 篇/);
  phase=1;await act(async()=>root.root.findAllByType('button').find(b=>text(b)==='加载更多草稿').props.onClick());
  assert.ok(calls.includes('/article-drafts?page=2'));assert.equal(root.root.findAll(n=>n.props.className==='admin-posts-filter-count').map(text).join(','),'3,1,2');
  assert.equal(root.root.findAllByType('article').length,3);assert.equal(root.root.findAll(n=>n.props.className==='admin-posts-unpublished').length,1);
  assert.match(text(root.toJSON()),/共 3 篇/);assert.equal(root.root.findAllByType('input').length,0);
  assert.equal(root.root.findAllByType('button').filter(b=>/删除/.test(text(b))).length,0);
  assert.equal(root.root.findAllByType('a').some(a=>a.findAllByType('button').length>0),false);
 }finally{root?.unmount();}
});

test('post pagination stays server-side and editor cannot import',async()=>{
 const calls=[];const Page=load(file,async url=>{calls.push(url);return url.startsWith('/admin/posts')?{items:[post(1)],total:51,page:url.includes('page=2')?2:1}:{items:[],total:0,page:1};},'editor');let root;
 try{
  await act(async()=>{root=create(React.createElement(Page));});assert.equal(root.root.findAllByType('nav').length,1);assert.doesNotMatch(text(root.toJSON()),/从旧站导入/);
  await act(async()=>root.root.findAllByType('button').find(b=>text(b)==='下一页').props.onClick());assert.ok(calls.includes('/admin/posts?page=2&pageSize=50&status=all'));assert.equal(root.root.findAll(n=>n.props.className==='admin-posts-filter-count').length,0);
 }finally{root?.unmount();}
});

test('draft delete retains version and existing confirmation, and reloads page one',async()=>{
 const writes=[],confirms=[];let removed=false;const Page=load(file,async(url,options)=>{if(options){writes.push({url,options});removed=true;return {}}return url.startsWith('/admin/posts')?{items:[],total:0,page:1}:{items:removed?[]:[draft('待删')],total:removed?0:1,page:1};},'owner',async message=>{confirms.push(message);return true});let root;
 try{
  await act(async()=>{root=create(React.createElement(Page));});await act(async()=>root.root.findAllByType('menuitem').find(m=>text(m)==='删除草稿').props.onSelect());
  assert.deepEqual(confirms,['删除这份未发布草稿？']);assert.equal(writes[0].url,'/article-drafts/待删');assert.equal(writes[0].options.method,'DELETE');assert.deepEqual(JSON.parse(writes[0].options.body),{version:7});assert.doesNotMatch(text(root.toJSON()),/待删/);assert.match(text(root.toJSON()),/已显示 0 篇/);
 }finally{root?.unmount();}
});


test('import remains mounted with its result when dialog content closes and reopens',async()=>{
 const context=React.createContext(null);let mounts=0;
 function Dialog({children}){const [open,setOpen]=React.useState(false);return React.createElement(context.Provider,{value:{open,setOpen}},children)}
 function Trigger({children}){const {setOpen}=React.useContext(context);return React.cloneElement(children,{onClick:()=>setOpen(true)})}
 function Content({children}){const {open,setOpen}=React.useContext(context);return open?React.createElement('dialog-fixture',{close:()=>setOpen(false)},children):null}
 function Import(){const [result,setResult]=React.useState('待导入');React.useEffect(()=>{mounts++},[]);return React.createElement('button',{onClick:()=>setResult('导入成功与警告保留')},result)}
 const Page=load(file,async()=>({items:[],total:0,page:1}),'owner',async()=>true,{
  '../components/ArticleImport':{ArticleImport:Import},'../components/ui/dialog':{Dialog,DialogTrigger:Trigger,DialogContent:Content,DialogTitle:'h3'},
 });let root;
 try{
  await act(async()=>{root=create(React.createElement(Page));});
  const open=()=>root.root.findAllByType('button').find(b=>text(b)==='从旧站导入').props.onClick();
  await act(async()=>open());await act(async()=>root.root.findAllByType('button').find(b=>text(b)==='待导入').props.onClick());
  await act(async()=>root.root.findByType('dialog-fixture').props.close());await act(async()=>open());
  assert.equal(mounts,1);assert.match(text(root.toJSON()),/导入成功与警告保留/);
 }finally{root?.unmount();}
});


test('published article actions use public slugs and legacy fallback without exposing draft links',async()=>{
 const Page=load(file,async url=>url.startsWith('/admin/posts')?{items:[{...post(1),slug:'first-article'},post(2),{...post(3,'draft'),slug:'not-published'}],total:3,page:1}:{items:[],total:0,page:1});let root;
 try{
  await act(async()=>{root=create(React.createElement(Page));});
  const publicLinks=root.root.findAllByType('a').map(a=>a.props.href).filter(href=>href.startsWith('/article/'));
  assert.deepEqual(publicLinks,['/article/first-article','/article/2']);
 }finally{root?.unmount();}
});

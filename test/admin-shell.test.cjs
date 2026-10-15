const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {JSDOM}=require('jsdom');
function load(file,imports={},cache=new Map()) {
 const absolute=path.resolve(file);if(cache.has(absolute))return cache.get(absolute);
 const m={exports:{}};cache.set(absolute,m.exports);
 const code=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>{
  if(name.endsWith('.css'))return {};
  if(name in imports)return imports[name];
  if(name.startsWith('.')) {const base=path.resolve(path.dirname(absolute),name);const found=['.tsx','.ts'].map(ext=>base+ext).find(fs.existsSync);if(found)return load(found,imports,cache);}
  return require(name);
 },m,m.exports);cache.set(absolute,m.exports);return m.exports;
}
let role='owner',pathname='/admin/comments',publishing=true,operations=true;
const imports={
 '../../context/AuthContext':{useAuth:()=>({user:{username:'测试站长',role},logout:async()=>false,loggingOut:false,logoutError:''})},
 '../../context/ThemeContext':{ThemeToggle:()=>React.createElement('button',{'aria-label':'切换主题'},'主题')},
 '../../lib/usePublishing':{usePublishing:()=>publishing},'../../lib/useOperations':{useOperations:()=>operations},
 'react-router-dom':{useLocation:()=>({pathname}),Link:({to,children,...props})=>React.createElement('a',{href:to,...props},children),NavLink:({to,children,end,...props})=>React.createElement('a',{href:to,...props,'aria-current':(end?pathname===to:pathname.startsWith(to))?'page':undefined},children)},
};
const {AdminShell}=load('src/app/components/admin/AdminShell.tsx',imports);
function shell(){return new JSDOM(renderToStaticMarkup(React.createElement(AdminShell,null,React.createElement('h1',null,'页面')))).window.document;}
function nav(doc){return [...doc.querySelectorAll('nav a')].map(a=>a.getAttribute('href'));}
test('admin navigation preserves role permissions and publishing feature gates',()=>{
 role='owner';publishing=true;operations=true;let items=nav(shell());
 for(const route of ['/admin/posts','/admin/media','/admin/users','/admin/login-settings','/admin/reviews','/admin/operations'])assert.ok(items.includes(route),route);
 role='admin';items=nav(shell());assert.ok(items.includes('/admin/users'));assert.ok(!items.includes('/admin/login-settings'));assert.ok(!items.includes('/admin/node-monitor'));
 role='editor';items=nav(shell());assert.ok(items.includes('/admin/posts'));assert.ok(items.includes('/admin/write'));assert.ok(!items.includes('/admin/media'));assert.ok(!items.includes('/admin/users'));
 role='user';items=nav(shell());assert.ok(items.includes('/admin/editor-apply'));assert.ok(!items.includes('/admin/posts'));
 role='owner';publishing=false;operations=false;items=nav(shell());assert.ok(!items.includes('/admin/reviews'));assert.ok(!items.includes('/admin/operations'));assert.ok(items.includes('/admin/posts'));
 publishing=true;operations=true;
});
test('details retain path-based defaults without adding persistent navigation state',()=>{
 role='owner';pathname='/admin/comments';let doc=shell();
 const groups=()=>Object.fromEntries([...doc.querySelectorAll('.admin-menu-group')].map(d=>[d.querySelector('summary span').textContent,d.open]));
 assert.deepEqual(groups(),{'工作台':true,'内容与发布':false,'用户与互动':true,'邮件与订阅':false,'站点与系统':false});
 pathname='/admin/posts/17/edit';doc=shell();assert.equal(groups()['内容与发布'],true);assert.equal(groups()['用户与互动'],false);
 assert.equal(doc.querySelectorAll('.admin-user-trigger').length,1);assert.match(doc.querySelector('.admin-user-identity').textContent,/测试站长站长/);
 assert.doesNotMatch(fs.readFileSync('src/app/components/admin/AdminShell.tsx','utf8'),/localStorage|sessionStorage/);
});
test('AdminButton forwards real DOM refs and asChild link props for Radix and focus restoration',async()=>{
 const dom=new JSDOM('<div id="host"></div>',{url:'http://localhost/admin',pretendToBeVisual:true});const previous=new Map();
 for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})) {previous.set(key,Object.getOwnPropertyDescriptor(global,key));Object.defineProperty(global,key,{value,writable:true,configurable:true});}
 const {createRoot}=require('react-dom/client'),{act}=React;const {AdminButton}=load('src/app/components/admin/AdminButton.tsx');const root=createRoot(document.getElementById('host'));const ref=React.createRef();let clicks=0;
 try {
  await act(async()=>root.render(React.createElement(AdminButton,{ref,variant:'soft',onClick:()=>clicks++,'aria-label':'设置'},'设置')));
  assert.equal(ref.current.tagName,'BUTTON');ref.current.focus();assert.equal(document.activeElement,ref.current);await act(async()=>ref.current.click());assert.equal(clicks,1);
  await act(async()=>root.render(React.createElement(AdminButton,{ref,asChild:true,variant:'ghost'},React.createElement('a',{href:'/admin/posts'},'文章管理'))));
  assert.equal(ref.current.tagName,'A');assert.equal(ref.current.getAttribute('href'),'/admin/posts');assert.ok(ref.current.classList.contains('admin-button--ghost'));
 }finally{await act(async()=>root.unmount());dom.window.close();for(const [key,value] of previous){if(value)Object.defineProperty(global,key,value);else delete global[key];}}
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const React=require('react');
const {act,create}=require('react-test-renderer');
const Router=require('react-router-dom');
const {fixture:i18nFixture}=require('./helpers/i18n.cjs');

async function fixture(){
  const calls=[],listeners=new Set(),stored=new Map(),cache=new Map();
  const initial={
    config:{mode:'auto',manual:null,modules:{halloween:{enabled:true,level:'major',priority:1,rule:{type:'fixed',month:10,day:31,durationDays:1},warmupDays:0,extensionDays:0,exceptions:{},options:{}}}},
    catalog:[{id:'halloween',name:'万圣节',implemented:true,options:[]}],
    state:{active:null,reason:'等待节日',serverTime:'2026-11-01T00:00:00Z',nextCheckAt:'2026-11-02T00:00:00Z',modules:[]},
  };
  const api=async(url,options={})=>{
    calls.push({url,method:options.method||'GET',body:options.body&&JSON.parse(options.body)});
    if(url.endsWith('/preview'))return structuredClone(initial.state);
    if(options.method==='PUT')initial.config=JSON.parse(options.body);
    return structuredClone(initial);
  };
  const window={addEventListener(type,fn){if(type==='beforeunload')listeners.add(fn);},removeEventListener(type,fn){if(type==='beforeunload')listeners.delete(fn);},dispatchEvent(){}};
  const document={title:'',head:{},activeElement:null};
  const mocks={
    '../lib/api':{api},
    '../lib/feedback':{notify:{success(){}}},
    '../context/SiteSettingsContext':{useSiteSettings:()=>({data:{brand:{site_title:'测试站'}}})},
    './festivals-v2/Editor':()=>null,
    './festivals-v2/Timeline':()=>null,
    './festivals-v2/Select':props=>React.createElement('select',props),
  };
  function load(file){
    file=path.resolve(file);
    if(cache.has(file))return cache.get(file).exports;
    const module={exports:{}};cache.set(file,module);
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
    const resolve=name=>{
      if(mocks[name])return mocks[name];
      if(/\/(?:i18n)$/.test(name))return i18nFixture(name);
      if(name.endsWith('.css'))return {};
      if(!name.startsWith('.'))return require(name);
      const base=path.resolve(path.dirname(file),name);
      return load(fs.existsSync(base+'.tsx')?base+'.tsx':base+'.ts');
    };
    new Function('require','module','exports','window','document','MutationObserver','HTMLElement','sessionStorage','setInterval','clearInterval',code)(resolve,module,module.exports,window,document,class{observe(){}disconnect(){}},class{}, {setItem:(key,value)=>stored.set(key,value)},()=>1,()=>{});
    return module.exports;
  }
  const Page=load('src/app/pages/AdminFestivalsPage.tsx').default;
  const {NavigationProtection}=load('src/app/components/NavigationProtection.tsx');
  const {confirmationStore,finishConfirmation}=load('src/app/lib/confirmAction.ts');
  const {hasUnsavedChanges}=load('src/app/lib/useUnsavedLeave.ts');
  function Shell(){return React.createElement(React.Fragment,null,React.createElement(NavigationProtection),React.createElement(Router.Link,{to:'/admin/posts'},'文章管理'),React.createElement(Router.Outlet));}
  const router=Router.createMemoryRouter([{element:React.createElement(Shell),children:[{path:'/admin/festivals',element:React.createElement(Page)},{path:'/admin/posts',element:React.createElement('p',null,'文章管理页')},{path:'/',element:React.createElement('p',null,'首页')}]}],{initialEntries:['/admin/festivals']});
  let root;
  await act(async()=>{root=create(React.createElement(Router.RouterProvider,{router}));});
  return {
    root,router,calls,listeners,stored,hasUnsavedChanges,
    confirmation:()=>confirmationStore.getSnapshot(),
    answer:async accepted=>act(async()=>finishConfirmation(accepted)),
    dirty:async()=>act(async()=>root.root.findAllByProps({role:'radio'}).find(node=>node.children.join('')==='全部关闭').props.onClick()),
    selected:()=>root.root.findAllByProps({role:'radio'}).find(node=>node.props['aria-checked']).children.join(''),
    sidebar:async()=>act(async()=>root.root.findByType('a').props.onClick({button:0,preventDefault(){},defaultPrevented:false})),
    preview:async()=>act(async()=>root.root.findAllByType('form')[1].props.onSubmit({preventDefault(){}})),
    save:async()=>act(async()=>root.root.findByProps({id:'fv-settings'}).props.onSubmit({preventDefault(){}})),
    close:async()=>{await act(async()=>root.unmount());router.dispose();assert.equal(hasUnsavedChanges(),false);assert.equal(listeners.size,0);},
  };
}

for(const [action,destination] of [['sidebar','/admin/posts'],['preview','/']]){
  test(`festival ${action} navigation warns; cancel retains edits and discard proceeds`,async()=>{
    const f=await fixture();
    try{
      assert.equal(f.hasUnsavedChanges(),false);
      await f.dirty();
      assert.equal(f.hasUnsavedChanges(),true);
      assert.equal(f.listeners.size,1);
      await f[action]();
      assert.equal(f.router.state.location.pathname,'/admin/festivals');
      assert.match(f.confirmation().message,/改动将丢失/);
      await f.answer(false);
      assert.equal(f.router.state.location.pathname,'/admin/festivals');
      assert.equal(f.selected(),'全部关闭');
      assert.equal(f.hasUnsavedChanges(),true);
      await f[action]();
      assert.ok(f.confirmation());
      await f.answer(true);
      assert.equal(f.router.state.location.pathname,destination);
      assert.equal(f.hasUnsavedChanges(),false);
      assert.equal(f.listeners.size,0);
      if(action==='preview'){
        assert.equal(JSON.parse(f.stored.get('mooncci-festival-preview')).festivalId,'halloween');
        assert.ok(f.calls.some(call=>call.url.endsWith('/preview')&&call.body.festivalId==='halloween'));
      }
    }finally{await f.close();}
  });
}

test('successful festival save clears dirty state and permits sidebar navigation without confirmation',async()=>{
  const f=await fixture();
  try{
    await f.dirty();
    await f.save();
    assert.equal(f.selected(),'全部关闭');
    assert.equal(f.calls.find(call=>call.method==='PUT').body.mode,'off');
    assert.equal(f.hasUnsavedChanges(),false);
    assert.equal(f.listeners.size,0);
    await f.sidebar();
    assert.equal(f.router.state.location.pathname,'/admin/posts');
    assert.equal(f.confirmation(),null);
  }finally{await f.close();}
});

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react'),{act,create}=require('react-test-renderer');
function load(file,imports={}){const m={exports:{}};new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText)(m.exports,name=>imports[name]||require(name));return m.exports;}

test('header search ignores repeated submissions, preserves search context and keeps formal new searches in history',async()=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<body></body>'),saved={};
 for(const name of ['window','document','CustomEvent']){saved[name]=Object.getOwnPropertyDescriptor(global,name);Object.defineProperty(global,name,{configurable:true,value:dom.window[name]});}
 window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 let location={pathname:'/search',search:'?q=repeat&keep=1',hash:'#kept'},root;const calls=[];
 const {Header}=load('src/app/components/Header.tsx',{
  'react-router-dom':{Link:'a',NavLink:'a',useLocation:()=>location,useNavigate:()=>target=>calls.push(target)},
  '../lib/responsiveImage':{},'../lib/usePublishing':{usePublishing:()=>false},
  '../context/AuthContext':{useAuth:()=>({user:null})},'../context/ThemeContext':{ThemeToggle:()=>null},
  '../context/SiteSettingsContext':{useSiteSettings:()=>({data:{}})},'../lib/safeUrl':{safeImageSrc:()=>''},
  '../lib/preloadPage':{},'../lib/focusLoop':{},'../../styles/navigation.css':{},
 });
 const open=async value=>{await act(async()=>root.root.findByProps({'aria-controls':'header-search-form'}).props.onClick());await act(async()=>root.root.findByProps({id:'header-query'}).props.onChange({target:{value}}));};
 const submit=async()=>act(async()=>root.root.findByProps({id:'header-search-form'}).props.onSubmit({preventDefault(){}}));
 try{await act(async()=>{root=create(React.createElement(Header));});await open('repeat');await submit();assert.equal(calls.length,0);assert.equal(root.root.findAllByProps({id:'header-search-form'}).length,0);
  await open('new');await submit();assert.deepEqual(calls.pop(),{pathname:'/search',search:'?q=new&keep=1',hash:'#kept'});
  location={pathname:'/search',search:'?q=new&keep=1&page=2&category=code&tag=js',hash:'#kept'};await act(async()=>root.update(React.createElement(Header)));await open('new');await submit();assert.equal(calls.pop().search,'?q=new&keep=1');
  location={pathname:'/account/settings',search:'?private=value',hash:'#private'};await act(async()=>root.update(React.createElement(Header)));await open('word');const input=root.root.findByProps({id:'header-query'});input.props.onCompositionStart();await submit();assert.equal(calls.length,0);input.props.onCompositionEnd();await submit();assert.deepEqual(calls.pop(),{pathname:'/search',search:'?q=word',hash:''});
 }finally{await act(async()=>root?.unmount());dom.window.close();for(const[name,descriptor]of Object.entries(saved)){if(descriptor)Object.defineProperty(global,name,descriptor);else delete global[name];}}
});

test('query adapter preserves hash, composes rapid intentions, ignores identical state and recovers after a blocked navigation',async()=>{
 let params=new URLSearchParams('type=post&keep=1'),key='a',set,root;const calls=[];
 const {createSearchParams}=require('react-router-dom');
 const router={createSearchParams,useSearchParams:()=>[params],useLocation:()=>({pathname:'/updates',search:'?'+params,hash:'#kept',key}),useNavigate:()=>((target,options)=>calls.push({target,options}))};
 const {usePageSearchParams}=load('src/app/lib/usePageSearchParams.ts',{'react-router-dom':router});
 function Probe(){[,set]=usePageSearchParams();return null;}
 try{await act(async()=>{root=create(React.createElement(Probe));});
  const change=value=>current=>{current.set('type',value);return current;};
  set(change('update'),{replace:true});set(change('post'),{replace:true});set(change('post'));
  assert.deepEqual(calls.map(x=>x.target.search),['?type=update&keep=1','?type=post&keep=1']);assert(calls.every(x=>x.target.hash==='#kept'));
  assert.deepEqual(calls[0].options,{replace:true});
  set(current=>{current.set('page','2');return current;},{state:{pagination:{top:500}}});assert.equal(calls.at(-1).options.replace,undefined,'Formal page navigation keeps push semantics');
  // A cancelled Router blocker renders the unchanged committed location again.
  await act(async()=>root.update(React.createElement(Probe)));set(current=>{current.set('page','2');return current;});assert.equal(calls.length,4,'A blocked target is not mistaken for the committed URL');
  params=new URLSearchParams('type=update&keep=1');key='b';await act(async()=>root.update(React.createElement(Probe)));set(change('post'));assert.equal(calls.at(-1).target.search,'?type=post&keep=1');
 }finally{await act(async()=>root?.unmount());}
});

test('draft owners may explicitly keep a mounted same-page draft; other forms and real departures stay protected',async()=>{
 const saved=Object.getOwnPropertyDescriptor(global,'window');Object.defineProperty(global,'window',{configurable:true,value:new EventTarget()});let root;
 const {useUnsavedLeave,hasUnsavedChanges,shouldBlockNavigation}=load('src/app/lib/useUnsavedLeave.ts');
 function Probe({same=false,other=false}){useUnsavedLeave(true,same);useUnsavedLeave(other);return null;}
 const nav=path=>({currentLocation:{pathname:'/account/mailbox'},nextLocation:{pathname:path}});
 try{await act(async()=>{root=create(React.createElement(Probe,{same:true}));});assert(hasUnsavedChanges());assert.equal(shouldBlockNavigation(nav('/account/mailbox')),false);assert.equal(shouldBlockNavigation(nav('/articles')),true);
  const unload=new Event('beforeunload',{cancelable:true});window.dispatchEvent(unload);assert(unload.defaultPrevented,'Reload still protects in-memory mail drafts');
  await act(async()=>root.update(React.createElement(Probe,{same:true,other:true})));assert.equal(shouldBlockNavigation(nav('/account/mailbox')),true,'Another dirty form never inherits the mailbox exemption');
 }finally{await act(async()=>root?.unmount());assert.equal(hasUnsavedChanges(),false);if(saved)Object.defineProperty(global,'window',saved);else delete global.window;}
});

test('site back uses proven history for ordinary clicks and explicit destinations for direct entry',async()=>{
 let previous=null,pathname='/article/1',root;const calls=[];
 const {SiteBack}=load('src/app/components/SiteBack.tsx',{'react-router-dom':{Link:({to,children,...props})=>React.createElement('a',{href:to,...props},children),useLocation:()=>({pathname}),useNavigate:()=>value=>calls.push(value)},'../lib/safeUrl':{safeRoutePath:path=>path.startsWith('/')&&!path.startsWith('//')?path:''},'./RoutePosition':{usePreviousSiteVisit:()=>previous}});
 try{await act(async()=>{root=create(React.createElement(SiteBack));});let link=root.root.findByType('a');assert.equal(link.props.href,'/articles');assert.equal(link.children.join(''),'← 文章库');let stopped=0;const click={button:0,preventDefault(){stopped++;}};link.props.onClick(click);assert.equal(stopped,0);assert.equal(calls.length,0);
  previous={path:'/search?q=数组&page=2#kept'};await act(async()=>root.update(React.createElement(SiteBack)));link=root.root.findByType('a');assert.equal(link.props.href,previous.path);link.props.onClick({...click,ctrlKey:true});assert.equal(calls.length,0);link.props.onClick(click);assert.deepEqual(calls,[-1]);
  pathname='/';await act(async()=>root.update(React.createElement(SiteBack)));assert.equal(root.toJSON(),null);
 }finally{await act(async()=>root?.unmount());}
});

test('sensitive link cleanup uses Router replace and removes only its token, preserving other URL state',async()=>{
 for(const [file,url,expected]of[
  ['SubscriptionPage','/subscription/confirm?keep=1#'+'a'.repeat(64),{pathname:'/subscription/confirm',search:'?keep=1',hash:''}],
  ['ResetPasswordPage','/reset-password?keep=1&token=secret#section',{pathname:'/reset-password',search:'?keep=1',hash:'#section'}],
  ['ResetPasswordPage','/reset-password?keep=1#keep=2&token=secret',{pathname:'/reset-password',search:'?keep=1',hash:'#keep=2'}],
 ]){
  const browser=new URL(url,'https://fixture.invalid'),calls=[],location={pathname:browser.pathname,search:browser.search,hash:browser.hash,state:{context:'kept'}},m={exports:{}};
  const box=({children})=>React.createElement('div',null,children);
  const imports={'react-router-dom':{Link:'a',useParams:()=>({action:'confirm'}),useSearchParams:()=>[browser.searchParams],useLocation:()=>location,useNavigate:()=>((...args)=>calls.push(args))},'../lib/api':{},'../lib/loginDestination':{loginDestination:()=>'/account',authLink:path=>path},'../components/AuthShell':{AuthShell:box},'../components/FormInput':{FormInput:box},'../components/ContentUI':{PageHeading:box,SitePage:box},'lucide-react':{Lock:'svg',Mail:'svg',CheckCircle2:'svg',CircleAlert:'svg'}};
  new Function('exports','require','window',ts.transpileModule(fs.readFileSync('src/app/pages/'+file+'.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(m.exports,name=>name.endsWith('.css')?{}:imports[name]||require(name),{location:browser});
  let root;try{await act(async()=>{root=create(React.createElement(m.exports.default));});assert.deepEqual(calls,[[expected,{replace:true,state:{context:'kept'}}]]);}finally{await act(async()=>root?.unmount());}
 }
});

test('unchanged article markup keeps its heading component identity across route-only updates',async()=>{
 let renders=0,root;const box=({children})=>children;
 const {MarkdownContent}=load('src/app/components/MarkdownContent.tsx',{
  '../lib/richText':{isRichText:()=>false},'./RichTextContent':{},'./CodeBlock':{},
  'react-markdown':{default:({components,children})=>{renders++;return React.createElement(components.h2,{node:{position:{start:{line:1}}}},children);}},
  '../lib/remarkGfmRead':{},'remark-parse':{},unified:{},'../lib/safeUrl':{},'../lib/imageDimensions':{},
  './ArticleImagePreview':{ArticleImagePreview:box,LinkedImages:box,PreviewImage:'img'},
 });
 function Parent({hash,content='Body'}){return React.createElement('section',{'data-hash':hash},React.createElement(MarkdownContent,{content,headingPrefix:'heading'}));}
 try{await act(async()=>{root=create(React.createElement(Parent,{hash:''}));});const first=root.root.findByType('h2');
  await act(async()=>root.update(React.createElement(Parent,{hash:'#heading-0'})));assert.equal(renders,1);assert.equal(root.root.findByType('h2'),first,'URL-only updates preserve the focused heading');
  await act(async()=>root.update(React.createElement(Parent,{hash:'#heading-0',content:'Updated body'})));assert.equal(renders,2);assert.equal(root.root.findByType('h2').children.join(''),'Updated body');
 }finally{await act(async()=>root?.unmount());}
});

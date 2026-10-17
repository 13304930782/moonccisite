const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),{act,create}=require('react-test-renderer'),fs=require('node:fs'),ts=require('typescript');
const box=({children})=>React.createElement('div',null,children);
function page(file,initial,data,context={}){
 let current=new URLSearchParams(initial),pagination,results;const calls=[];
 const read=()=>[current,(next,options)=>{const result=typeof next==='function'?next(current):new URLSearchParams(next);if(result.toString()===current.toString())return;current=result;calls.push({params:Object.fromEntries(current),options});}];
 const imports={
  'react-router-dom':{Link:'a',useParams:()=>({slug:'fixture'}),useSearchParams:read},'../lib/usePageSearchParams':{usePageSearchParams:read},
  '../components/ContentUI':{SitePage:box,PageHeading:box,ResourceState:box,Pagination:props=>{pagination=props;return null;},useResource:()=>({data,loading:false}),labels:{},formatDate:()=> '2026/10/16'},
  '../components/PostResults':{PostResults:props=>{results=props;return null;}},'../components/ThemeSelect':{ThemeSelect:({children,value,onValueChange,...props})=>React.createElement('select',{...props,value,onChange:event=>onValueChange(event.target.value)},children)},
  '../components/DetailUI':{EmptyState:box},'../components/SiteBack':{SiteBack:box},'../components/RoutePosition':{useRestoredPagePosition:()=>Boolean(context.restoring)},'../components/ProjectCard':{ProjectCard:box},'../components/MarkdownContent':{MarkdownContent:box,headingsFor:()=>[]},'../lib/safeUrl':{safeImageSrc:()=>'',safeHref:s=>s},'../lib/projectBrand':{projectIcon:()=>undefined},'../lib/imageDimensions':{dimensionsFor:()=>({})},
  '../context/AuthContext':{useAuth:()=>({user:{id:1},loading:false})},'../lib/motionPreference':{reducedMotion:()=>true},'../components/Header':{Header:box},'../components/SiteFooter':{SiteFooter:box},'../components/ElectricityRssSubscription':{ElectricityRssSubscription:box},
  'lucide-react':Object.fromEntries(['Activity','AlertTriangle','BatteryCharging','CalendarDays','RefreshCw','TrendingDown','Zap'].map(name=>[name,'svg'])),
  '../lib/api':{api:async url=>({data:url==='/electricity/rooms'?[{id:'a',name:'A'},{id:'b',name:'B'}]:{current:null,history:[],metrics:{},status:'unknown'}})},
 };
 const module={exports:{}},code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('module','exports','require',code)(module,module.exports,name=>name.endsWith('.css')?{}:Object.hasOwn(imports,name)?imports[name]:require(name));
 return{exports:module.exports,calls,setData:value=>{data=value;},setQuery:value=>{current=new URLSearchParams(value);},get pagination(){return pagination;},get results(){return results;}};
}
test('search distinguishes committed queries from light filters, preserves other parameters and ignores repeated selection',async()=>{
 const f=page('src/app/pages/SearchPage.tsx','q=original&category=tech&tag=React&page=3&from=home',[]);let root;
 try{await act(async()=>{root=create(React.createElement(f.exports.default));});root.root.findByProps({'aria-label':'分类'}).props.onValueChange('tech');assert.equal(f.calls.length,0,'reselecting the active category keeps the current page');
  await act(async()=>root.root.findByProps({'aria-label':'分类'}).props.onValueChange('design'));assert.deepEqual(f.calls[0],{params:{q:'original',category:'design',tag:'React',from:'home'},options:{replace:true}});
  await act(async()=>root.root.findByProps({id:'article-search'}).props.onChange({target:{value:'新的查询'}}));const input=root.root.findByProps({id:'article-search'});input.props.onCompositionStart();root.root.findByType('form').props.onSubmit({preventDefault(){}});assert.equal(f.calls.length,1,'IME candidate confirmation does not submit');input.props.onCompositionEnd();
  await act(async()=>root.root.findByType('form').props.onSubmit({preventDefault(){}}));assert.deepEqual(f.calls[1],{params:{q:'新的查询',category:'design',tag:'React',from:'home'},options:{replace:false}});
  await act(async()=>root.update(React.createElement(f.exports.default)));root.root.findByType('form').props.onSubmit({preventDefault(){}});assert.equal(f.calls.length,2,'the same committed search adds no history');
  await act(async()=>f.results.emptyAction.props.onClick());assert.deepEqual(f.calls[2],{params:{from:'home'},options:{replace:true}},'clear removes search fields without discarding unrelated URL parameters');
 }finally{await act(async()=>root?.unmount());}
});
test('public room selection replaces only roomId and reselecting the implicit default is a no-op',async()=>{
 const f=page('src/app/pages/ElectricityPage.tsx','from=home',null),saved=Object.getOwnPropertyDescriptor(global,'window');let root;Object.defineProperty(global,'window',{configurable:true,value:{matchMedia:()=>({addEventListener(){},removeEventListener(){}}),addEventListener(){},removeEventListener(){}}});
 try{await act(async()=>{root=create(React.createElement(f.exports.default));});const rooms=root.root.findByProps({'aria-label':'切换宿舍'});rooms.props.onValueChange('a');assert.equal(f.calls.length,0);rooms.props.onValueChange('b');assert.deepEqual(f.calls[0],{params:{from:'home',roomId:'b'},options:{replace:true}});rooms.props.onValueChange('a');assert.deepEqual(f.calls[1],{params:{from:'home',roomId:'a'},options:{replace:true}},'rapid reverse follows the latest parameter value');
 }finally{await act(async()=>root?.unmount());if(saved)Object.defineProperty(global,'window',saved);else delete global.window;}
});
test('two light filter changes before a rerender still follow the newest selection',async()=>{
 const f=page('src/app/pages/SearchPage.tsx','q=start&category=tech&page=2&from=home',[]);let root;
 try{await act(async()=>{root=create(React.createElement(f.exports.default));});const category=root.root.findByProps({'aria-label':'分类'});category.props.onValueChange('design');category.props.onValueChange('tech');assert.deepEqual(f.calls.map(c=>c.params),[{q:'start',category:'design',from:'home'},{q:'start',category:'tech',from:'home'}]);category.props.onValueChange('tech');assert.equal(f.calls.length,2);
 }finally{await act(async()=>root?.unmount());}
});
for(const [file,exportName]of[['ProjectsPage.tsx','default'],['ProjectsPage.tsx','ProjectDetailPage'],['ArchivesPage.tsx','default']])test(`${exportName==='ProjectDetailPage'?'project releases':file} pagination preserves parameters and forwards shared navigation options`,async()=>{
 const data={id:1,name:'Fixture',content:'',items:[],months:[],page:2,total:30,pageSize:10,releases:{items:[],page:2,total:30,pageSize:10}},f=page('src/app/pages/'+file,'page=2&from=home&release=9',data),saved=Object.getOwnPropertyDescriptor(global,'document');let root;Object.defineProperty(global,'document',{configurable:true,value:{getElementById:()=>null}});
 try{await act(async()=>{root=create(React.createElement(f.exports[exportName]),{createNodeMock:()=>({querySelector:()=>null})});});const options={state:{pagination:{pathname:'/fixture',top:520,index:0}}};f.pagination.onPage(3,options);assert.deepEqual(f.calls[0],{params:{page:'3',from:'home',release:'9'},options});assert.equal(f.calls[0].options,options);f.pagination.onPage(1,options);assert.deepEqual(f.calls[1],{params:{from:'home',release:'9'},options});
 }finally{await act(async()=>root?.unmount());if(saved)Object.defineProperty(global,'document',saved);else delete global.document;}
});

test('release deep links focus once after data arrives; pagination, refresh and known POP retain their reading positions',async()=>{
 const savedDocument=Object.getOwnPropertyDescriptor(global,'document'),savedWindow=Object.getOwnPropertyDescriptor(global,'window'),calls=[],context={restoring:false};
 Object.defineProperty(global,'document',{configurable:true,value:{getElementById:id=>({getBoundingClientRect:()=>({top:id==='release-2'?450:300})})}});
 Object.defineProperty(global,'window',{configurable:true,value:{scrollY:200,scrollTo:options=>calls.push(options)}});
 const data=()=>({id:1,name:'Fixture',content:'',releases:{items:[],page:1,total:30,pageSize:10}}),f=page('src/app/pages/ProjectsPage.tsx','release=1',null,context);let root;
 const render=async()=>act(async()=>{root?root.update(React.createElement(f.exports.ProjectDetailPage)):root=create(React.createElement(f.exports.ProjectDetailPage));});
 try{
  await render();assert.equal(calls.length,0,'wait for the requested release DOM');f.setData(data());await render();assert.deepEqual(calls,[{top:400}],'a first-load POP entry with no saved position still follows its explicit deep link');
  f.setQuery('release=1&page=2');f.setData(null);await render();f.setData(data());await render();f.setData(data());await render();assert.equal(calls.length,1,'new page data and refresh must not replay the old release focus');
  f.setQuery('release=2&page=2');await render();assert.deepEqual(calls.at(-1),{top:550});assert.equal(calls.length,2,'a new explicit release still receives focus');
  context.restoring=true;f.setQuery('release=1');f.setData(data());await render();assert.equal(calls.length,2,'known POP lets the shared scroll restoration win');
  await act(async()=>root.unmount());root=null;const restored=page('src/app/pages/ProjectsPage.tsx','release=1',data(),{restoring:true});await act(async()=>{root=create(React.createElement(restored.exports.ProjectDetailPage));});assert.equal(calls.length,2,'a remounted known POP, including the first history entry, must not refocus');
 }finally{await act(async()=>root?.unmount());if(savedDocument)Object.defineProperty(global,'document',savedDocument);else delete global.document;if(savedWindow)Object.defineProperty(global,'window',savedWindow);else delete global.window;}
});

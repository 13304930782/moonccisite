const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const React=require('react'),{act}=React;
const {createRoot}=require('react-dom/client');
const {MemoryRouter,Routes,Route,useLocation,useNavigationType}=require('react-router-dom');
const {renderToStaticMarkup}=require('react-dom/server'),{StaticRouter}=require('react-router-dom');
const {JSDOM}=require('jsdom');
const fixture={resources:{},reads:[],views:[],seen:[]};
let m;
test.before(async()=>{
 const stubs={
  activityText:`export const homeActivityText=item=>({title:item.title,excerpt:item.excerpt||''});`,
  ContentUI:`export const labels={post:'文章'}; export const formatDate=value=>String(value||''); export const SitePage=({children})=>children; export const ResourceState=({children})=>children; export const SubscribeForm=()=>null; export function useResource(path){globalThis.fixture.reads.push(path);return {data:globalThis.fixture.resources[path]||null,loading:false};}`,
  PageAnalytics:`export function usePageView(path,id){globalThis.fixture.views.push({path,id});return 0;}`,
 };
 const bundle=await require('esbuild').build({stdin:{contents:"export {articlePath} from './lib/articleUrl'; export {BlogCard} from './components/BlogCard'; export {HomePostList,HomeActivityList} from './components/home/HomeActivityList'; export {default as ArticlePage} from './pages/ArticlePage';",resolveDir:path.resolve('src/app'),sourcefile:'article-url-test.tsx'},bundle:true,write:false,format:'cjs',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{name:'article-route-fixture',setup(build){
  build.onResolve({filter:/\/(?:activityText|ContentUI|PageAnalytics|ReadingProgress|ArticleSeries|ArticleDiscovery|CommentSection|ArticlePresentation)$/},args=>({path:args.path.split('/').pop(),namespace:'article-fixture'}));
  build.onLoad({filter:/.*/,namespace:'article-fixture'},args=>({contents:stubs[args.path]||`export function ${args.path}(props){globalThis.fixture.seen.push({component:'${args.path}',props});return null;}`,loader:'js'}));
 }}]});
 const context={module:{exports:{}},exports:{},require,console,fixture};vm.runInNewContext(bundle.outputFiles[0].text,context);m=context.module.exports;
});
const html=element=>JSDOM.fragment(renderToStaticMarkup(React.createElement(StaticRouter,{location:'/'},element)));
test('article URLs prefer encoded slugs and retain numeric legacy destinations',()=>{
 assert.equal(m.articlePath({id:20,slug:'cities-skylines-mods'}),'/article/cities-skylines-mods');
 assert.equal(m.articlePath({id:20,slug:'  cities-skylines-mods  '}),'/article/cities-skylines-mods');
 assert.equal(m.articlePath({id:20,slug:'legacy alias?#'}),'/article/legacy%20alias%3F%23');
 for(const slug of [undefined,null,'','  '])assert.equal(m.articlePath({id:20,slug}),'/article/20');
});
test('public cards use slugs while older payloads retain working numeric links',()=>{
 const props={id:20,slug:'cities-skylines-mods',title:'模组推荐',excerpt:'简介',date:'2026-01-01',tags:[],image:''};
 assert.equal(html(React.createElement(m.BlogCard,props)).querySelector('a').getAttribute('href'),'/article/cities-skylines-mods');
 assert.equal(html(React.createElement(m.BlogCard,{...props,slug:undefined})).querySelector('a').getAttribute('href'),'/article/20');
});
test('homepage article links prefer post slugs for both recent posts and activities',()=>{
 const posts=[{id:20,slug:'cities-skylines-mods',title:'模组推荐'},{id:18,title:'较早文章'}];
 assert.deepEqual(Array.from(html(React.createElement(m.HomePostList,{posts})).querySelectorAll('a'),a=>a.getAttribute('href')),['/article/cities-skylines-mods','/article/18']);
 const items=[{activity_id:'post-20',id:20,type:'post',title:'模组推荐',path:'/article/20',published_at:'2026-01-01'}];
 assert.equal(html(React.createElement(m.HomeActivityList,{items,posts,postsLoading:false})).querySelector('a').getAttribute('href'),'/article/cities-skylines-mods');
});
async function routed(post,entry){
 fixture.resources={'/posts/20':post,'/posts/cities-skylines-mods':post};fixture.reads=[];fixture.views=[];fixture.seen=[];
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://mooncci.example/article/20'});
 Object.assign(global,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 let location,navigation,root;
 function Probe(){location=useLocation();navigation=useNavigationType();return null;}
 await act(async()=>{root=createRoot(document.getElementById('root'));root.render(React.createElement(MemoryRouter,{initialEntries:[entry],future:{v7_startTransition:true,v7_relativeSplatPath:true}},React.createElement(React.Fragment,null,React.createElement(Probe),React.createElement(Routes,null,React.createElement(Route,{path:'/article/:id',element:React.createElement(m.ArticlePage)})))));});
 const result={location,navigation,reads:[...fixture.reads],views:[...fixture.views],seen:[...fixture.seen]};
 await act(async()=>root.unmount());dom.window.close();return result;
}
test('client canonical replacement preserves resume and heading while engagement keeps numeric IDs',async()=>{
 const result=await routed({id:20,slug:'cities-skylines-mods',status:'published',title:'模组推荐'},'/article/20?resume=1#heading-2');
 assert.equal(result.location.pathname,'/article/cities-skylines-mods');assert.equal(result.location.search,'?resume=1');assert.equal(result.location.hash,'#heading-2');assert.equal(result.navigation,'REPLACE');
 assert.ok(result.reads.includes('/posts/cities-skylines-mods'));
 assert.ok(result.views.length);for(const view of result.views){assert.equal(view.id,20);assert.equal(view.path,'/article/20');}
 for(const component of ['CommentSection','ArticleSeries','ArticleDiscovery']){const rendered=result.seen.find(x=>x.component===component);assert.ok(rendered);assert.equal(rendered.props.postId??rendered.props.id,20);}
 assert.equal(result.seen.find(x=>x.component==='ArticlePresentation').props.progress.props.postId,20);
 assert.ok(result.seen.some(x=>x.component==='ArticleDiscovery'&&x.props.slug==='cities-skylines-mods'));
});
test('unpublished articles and published posts without aliases keep their numeric route',async()=>{
 for(const post of [{id:20,slug:'cities-skylines-mods',status:'draft'},{id:20,status:'published'}]){
  const result=await routed(post,'/article/20');assert.equal(result.location.pathname,'/article/20');assert.equal(result.navigation,'POP');
 }
});

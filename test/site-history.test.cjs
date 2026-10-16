const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const moduleValue={exports:{}};
new Function('exports','module',ts.transpileModule(fs.readFileSync('src/app/lib/siteHistory.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(moduleValue.exports,moduleValue);
const {rememberSiteVisit}=moduleValue.exports;
function enter(visits,index,key,url,action='PUSH'){
 const parsed=new URL(url,'https://mooncci.site');
 return rememberSiteVisit(visits,index,{key,pathname:parsed.pathname,search:parsed.search,hash:parsed.hash},action);
}

test('first load, external entry, reload and a new tab have no proven previous entry',()=>{
 for(const index of [0,5,40]){
  const tab=new Map();
  assert.equal(enter(tab,index,'direct','/article/19','POP'),null);
  assert.equal(enter(new Map(),index,'direct','/article/19','POP'),null);
 }
});

test('back and forward preserve the real preceding URL including filters, page and hash',()=>{
 const tab=new Map();
 enter(tab,0,'home','/','POP');
 assert.deepEqual(enter(tab,1,'list','/search?q=导航&category=开发&page=2'),{key:'home',path:'/'});
 assert.deepEqual(enter(tab,2,'post','/article/19'),{key:'list',path:'/search?q=%E5%AF%BC%E8%88%AA&category=%E5%BC%80%E5%8F%91&page=2'});
 assert.deepEqual(enter(tab,3,'anchor','/article/19#heading'),{key:'post',path:'/article/19'});
 assert.deepEqual(enter(tab,2,'post','/article/19','POP'),{key:'list',path:'/search?q=%E5%AF%BC%E8%88%AA&category=%E5%BC%80%E5%8F%91&page=2'});
 assert.deepEqual(enter(tab,3,'anchor','/article/19#heading','POP'),{key:'post',path:'/article/19'});
 assert.deepEqual(enter(tab,1,'list','/search?q=导航&category=开发&page=2','POP'),{key:'home',path:'/'});
 assert.equal(enter(tab,0,'home','/','POP'),null);
});

test('replace retains the preceding entry and updates the source seen by forward navigation',()=>{
 const tab=new Map();enter(tab,0,'home','/','POP');enter(tab,1,'list','/articles');enter(tab,2,'post','/article/19');
 enter(tab,1,'list','/articles','POP');
 assert.deepEqual(enter(tab,1,'filtered','/articles?page=2','REPLACE'),{key:'home',path:'/'});
 assert.deepEqual(enter(tab,2,'post','/article/19','POP'),{key:'filtered',path:'/articles?page=2'});
});

test('a new push after back discards the old forward branch',()=>{
 const tab=new Map();enter(tab,0,'home','/','POP');enter(tab,1,'list','/articles');enter(tab,2,'old','/article/19');enter(tab,3,'future','/projects');
 enter(tab,1,'list','/articles','POP');
 assert.deepEqual(enter(tab,2,'new','/article/14'),{key:'list',path:'/articles'});
 assert.equal(tab.has(3),false);
 assert.equal(tab.get(2).key,'new');
});

test('batched pushes cannot mistake an old forward entry for an uncommitted new source',()=>{
 const tab=new Map();enter(tab,0,'home','/','POP');enter(tab,1,'old-list','/articles?page=2');enter(tab,2,'old-post','/article/19');
 enter(tab,0,'home','/','POP');
 assert.equal(enter(tab,2,'new-post','/article/14'),null);
 assert.equal(tab.has(1),false);
});

test('replace at an uncommitted index cannot resurrect a stale forward source',()=>{
 const tab=new Map();enter(tab,0,'home','/','POP');enter(tab,1,'old-list','/articles?page=2');enter(tab,2,'old-post','/article/19');
 enter(tab,0,'home','/','POP');
 assert.equal(enter(tab,2,'new-post','/article/14','REPLACE'),null);
});

test('unknown or invalid POP never infers a source from index or previously visited URLs',()=>{
 for(const index of [null,undefined,-1,1.5,NaN,'2',2]){
  const tab=new Map();enter(tab,0,'home','/','POP');enter(tab,1,'list','/articles');
  assert.equal(enter(tab,index,'unknown','/updates','POP'),null);
 }
});

test('TOC replaceState hash updates keep the known entry and its original predecessor',()=>{
 const tab=new Map();enter(tab,0,'home','/','POP');enter(tab,1,'post','/article/19');enter(tab,2,'project','/projects');
 assert.deepEqual(enter(tab,1,'post','/article/19#heading','POP'),{key:'home',path:'/'});
 assert.deepEqual(enter(tab,2,'project','/projects','POP'),{key:'post',path:'/article/19#heading'});
});

test('provenance is bounded without dropping the immediately preceding revisited entry',()=>{
 const tab=new Map();enter(tab,0,'home','/','POP');
 for(let index=1;index<100;index++)enter(tab,index,'key-'+index,'/articles?page='+index);
 enter(tab,0,'home','/','POP');
 assert.deepEqual(enter(tab,1,'branch','/updates'),{key:'home',path:'/'});
 assert.equal(tab.size,2);
});

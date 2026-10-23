const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
function load(file,overrides={}){const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','module','exports',code)(name=>name in overrides?overrides[name]:name.endsWith('.css')?{}:name.startsWith('.')?load(path.resolve(path.dirname(file),name)+'.ts',overrides):require(name),m,m.exports);return m.exports;}
const {searchExcerpt}=load('src/app/lib/searchExcerpt.ts');
test('search excerpt finds body match, strips markup and retains summary fallback',()=>{
 const content='开头 '.repeat(80)+'**DeepSeek** 用于生成相关链接。'+'后文 '.repeat(80);
 const result=searchExcerpt({summary:'原有简介',content},'deepseek');
 assert.match(result,/DeepSeek/);assert.ok(result.startsWith('…'));assert.ok(result.endsWith('…'));assert.ok(result.length<=182);assert.ok(!result.includes('**'));
 assert.equal(searchExcerpt({summary:'**保留简介**',content},'missing'),'保留简介');
 assert.equal(searchExcerpt({summary:'链接 [DeepSeek](https://example.com)',content},'DeepSeek'),'链接 DeepSeek');
 assert.equal(searchExcerpt({content:'<script>secret</script>\n\n正文关键词'},'关键词'),'正文关键词');
 assert.equal(searchExcerpt({summary:'简介'},'  '),'简介');
 assert.equal(searchExcerpt({},'test'),'');
});
test('series navigation shows loading, retry, sequence and safe disabled state',async()=>{
 const React=require('react'),{act,create}=require('react-test-renderer');global.IS_REACT_ACT_ENVIRONMENT=true;
 class ApiError extends Error{constructor(status){super('error');this.status=status;}}
 let mode='pending',resolve,root;
 const api=()=>mode==='pending'?new Promise(r=>resolve=r):mode==='error'?Promise.reject(new Error('offline')):mode==='disabled'?Promise.reject(new ApiError(404)):Promise.resolve({series:{slug:'s',title:'系列'},position:2,total:3,previous:{id:1,slug:'first',title:'前文'},next:null});
 const {ArticleSeries}=load('src/app/components/ArticleSeries.tsx',{'../lib/api':{api,ApiError},'react-router-dom':{Link:({to,children})=>React.createElement('a',{href:to},children)}});
 await act(async()=>{root=create(React.createElement(ArticleSeries,{id:2}));});assert.match(JSON.stringify(root.toJSON()),/正在读取/);
 await act(async()=>resolve(null));assert.equal(root.toJSON(),null);
 mode='error';await act(async()=>root.update(React.createElement(ArticleSeries,{id:3})));assert.match(JSON.stringify(root.toJSON()),/加载失败/);
 mode='success';await act(async()=>root.root.findByType('button').props.onClick());assert.match(JSON.stringify(root.toJSON()),/专栏上一篇/);assert.equal(root.root.findAllByType('a')[1].props.href,'/article/first');assert.match(JSON.stringify(root.toJSON()),/2/);
 mode='disabled';await act(async()=>root.update(React.createElement(ArticleSeries,{id:4})));assert.equal(root.toJSON(),null);await act(async()=>root.unmount());
});

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
const code=ts.transpileModule(fs.readFileSync('src/app/pages/AdminPostsPage.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
async function fixture(){
 const pending=[];const m={exports:{}};
 const mock=n=>n==='react'?React:n==='react/jsx-runtime'?require(n):n==='react-router-dom'?{Link:'a'}:n.endsWith('/AuthContext')?{useAuth:()=>({user:{role:'editor'}})}:n.endsWith('/api')?{api:path=>new Promise((resolve,reject)=>pending.push({path,resolve,reject}))}:n.endsWith('/ThemeSelect')?{ThemeSelect:'select'}:n.endsWith('/AdminPagination')?{AdminPagination:'nav'}:{};
 new Function('exports','require',code)(m.exports,mock);let root;await act(async()=>{root=create(React.createElement(m.exports.default));});return {root,pending};
}
test('older article-list requests cannot replace the newest draft list',async()=>{
 const f=await fixture();await act(async()=>f.root.root.findByType('select').props.onValueChange('draft'));
 await act(async()=>{f.pending[2].resolve({items:[],total:0,page:1});f.pending[3].resolve({items:[{id:'new',payload:{title:'Newest draft'}}],total:1});});
 await act(async()=>{f.pending[0].resolve({items:[],total:0,page:1});f.pending[1].resolve({items:[{id:'old',payload:{title:'Stale draft'}}],total:1});});
 const output=JSON.stringify(f.root.toJSON());assert(output.includes('Newest draft'));assert(!output.includes('Stale draft'));await act(async()=>f.root.unmount());
});
test('article-list failures provide a working retry that clears the old error',async()=>{
 const f=await fixture();await act(async()=>{f.pending[0].reject(Error('Offline'));f.pending[1].resolve({items:[],total:0});});assert(f.root.root.findByProps({role:'alert'}));
 await act(async()=>f.root.root.findAllByType('button').find(b=>b.children.includes('重新加载列表')).props.onClick());
 await act(async()=>{f.pending[2].resolve({items:[{id:1,title:'Recovered',status:'published'}],total:1,page:1});f.pending[3].resolve({items:[],total:0});});
 assert.equal(f.root.root.findAllByProps({role:'alert'}).length,0);assert(JSON.stringify(f.root.toJSON()).includes('Recovered'));await act(async()=>f.root.unmount());
});

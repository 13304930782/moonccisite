const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const React=require('react'),Renderer=require('react-test-renderer'),{MemoryRouter,useNavigate,useLocation}=require('react-router-dom');
let useContentListQuery;
test.before(async()=>{const result=await require('esbuild').build({entryPoints:['src/app/lib/useContentListQuery.ts'],bundle:true,write:false,platform:'node',format:'cjs',packages:'external'});const context={module:{exports:{}},require,URLSearchParams};vm.runInNewContext(result.outputFiles[0].text,context);useContentListQuery=context.module.exports.useContentListQuery;});
test('list query restores page, resets filters atomically, preserves other params and follows browser history',()=>{
 let query,navigate,location,tree;
 function Probe(){query=useContentListQuery();navigate=useNavigate();location=useLocation();return null;}
 Renderer.act(()=>{tree=Renderer.create(React.createElement(MemoryRouter,{initialEntries:['/?page=3&status=draft&keep=yes']},React.createElement(Probe)));});
 assert.equal(query.page,3);assert.equal(query.params.get('status'),'draft');
 Renderer.act(()=>query.update({status:'published',page:''}));assert.equal(query.page,1);assert.equal(query.params.get('keep'),'yes');assert.equal(query.params.get('status'),'published');
 Renderer.act(()=>query.setPage(99));assert.equal(query.page,99);
 Renderer.act(()=>query.setPage(2,true));assert.equal(query.page,2);
 Renderer.act(()=>navigate(-1));assert.equal(query.page,1);assert.equal(query.params.get('status'),'published');
 Renderer.act(()=>navigate(-1));assert.equal(query.page,3);assert.equal(query.params.get('status'),'draft');
 for(const value of ['-1','0','1.5','bad','Infinity','9007199254740992']){Renderer.act(()=>navigate('/?page='+value));assert.equal(query.page,1,value);}
 Renderer.act(()=>query.update({q:'中文 & image',page:''},true));assert.equal(new URLSearchParams(location.search).get('q'),'中文 & image');
 Renderer.act(()=>tree.unmount());
});

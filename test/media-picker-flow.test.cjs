const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
test('picker preserves selection on upload failure, retries once and selects the uploaded image',async()=>{
 const module={exports:{}},picked=[];let fail=true,calls=0,root;
 const code=ts.transpileModule(fs.readFileSync('src/app/components/ArticleMediaPicker.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const dialog=Object.fromEntries(['Root','Portal','Overlay','Content','Title','Description','Close'].map(k=>[k,k==='Close'?'button':'div']));
 const requireMock=n=>n==='lucide-react'?{Check:'svg'}:n==='react'?React:n==='react/jsx-runtime'?require(n):n.includes('react-dialog')?dialog:n.endsWith('/api')?{api:async()=>({items:[{filename:'old.png',url:'/old.png',display_name:'Existing'}],total:1})}:{safeImageSrc:x=>x||''};
 new Function('exports','require','AbortController',code)(module.exports,requireMock,AbortController);
 await act(async()=>{root=create(React.createElement(module.exports.ArticleMediaPicker,{onSelect:(...v)=>picked.push(v),onClose(){},uploadImage:async()=>{calls++;if(fail)throw Error('Offline');return '/new.png';}}));});
 const button=text=>root.root.findAllByType('button').find(b=>b.children.includes(text)||b.props['aria-label']===text);
 await act(async()=>root.root.findAllByType('button').find(b=>b.props['aria-pressed']===false).props.onClick());
 const input=root.root.findByProps({'aria-label':'上传图片'});
 await act(async()=>input.props.onChange({target:{files:[{name:'new.png'}],value:'new.png'}}));
 assert(root.root.findByProps({role:'alert'}));assert.equal(button('使用图片').props.disabled,false);assert.equal(calls,1);
 fail=false;await act(async()=>button('重试上传').props.onClick());assert.equal(calls,2);assert.equal(root.root.findAllByProps({role:'alert'}).length,0);
 await act(async()=>button('使用图片').props.onClick());assert.deepEqual(picked,[['/new.png','']]);root.unmount();
});

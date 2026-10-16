const {test}=require('node:test'),assert=require('node:assert/strict'),React=require('react'),{act,create}=require('react-test-renderer'),ts=require('typescript'),fs=require('node:fs');
async function fixture(reduced=false,foldHeight=0){
 const originals=new Map();const parentCancels=[];for(const [key,value]of Object.entries({window:{addEventListener(){},removeEventListener(){}},cancelAnimationFrame:id=>parentCancels.push(id)})){originals.set(key,Object.getOwnPropertyDescriptor(global,key));Object.defineProperty(global,key,{value,writable:true,configurable:true});}
 let next=1;const pending=new Map(),childCancels=[],focused=[],scrolls=[];
 const ownerWindow={innerHeight:900,scrollY:50,requestAnimationFrame(fn){const id=next++;pending.set(id,fn);return id;},cancelAnimationFrame(id){childCancels.push(id);pending.delete(id);},addEventListener(){},removeEventListener(){},IntersectionObserver:class{observe(){}disconnect(){}},MutationObserver:class{observe(){}disconnect(){}},history:{replaceState(){}},scrollTo:value=>scrolls.push(value)};
 const nodes=new Map(['one','two'].map(id=>[id,{id,getBoundingClientRect:()=>({top:id==='one'?300:600}),hasAttribute:()=>false,setAttribute(){},focus:options=>focused.push({id,options})}]));
 const ownerDocument={defaultView:ownerWindow,getElementById:id=>nodes.get(id),querySelector:()=>null},rail={ownerDocument,parentElement:{querySelector:()=>null},querySelector:()=>foldHeight?{getBoundingClientRect:()=>({height:foldHeight})}:null};
 const imports={'../lib/motionPreference':{reducedMotion:()=>reduced},'./MotionDisclosure':{MotionDisclosure:({open,children,...props})=>React.createElement('div',{...props,hidden:!open},children),MotionChevron:()=>null}};
 const module={exports:{}};new Function('module','exports','require',ts.transpileModule(fs.readFileSync('src/app/components/ArticleTableOfContents.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText)(module,module.exports,name=>imports[name]||require(name));
 let root;await act(async()=>{root=create(React.createElement(module.exports.ArticleTableOfContents,{headings:[{id:'one',title:'One',level:2},{id:'two',title:'Two',level:2}],preview:true}),{createNodeMock:()=>rail});});
 return {root,pending,parentCancels,childCancels,focused,scrolls,click:index=>root.root.findAllByType('a')[index].props.onClick({preventDefault(){}}),flush:()=>{for(const [id,callback]of pending){pending.delete(id);callback();}},close:async()=>{await act(async()=>root.unmount());for(const [key,descriptor]of originals){if(descriptor)Object.defineProperty(global,key,descriptor);else delete global[key];}}};
}
test('article preview TOC cancels the iframe-owned frame and follows only the newest click',async()=>{
 const f=await fixture();try{await act(async()=>{f.click(0);f.click(1);});assert.equal(f.pending.size,1);assert.deepEqual(f.childCancels,[1]);assert.deepEqual(f.parentCancels,[]);await act(async()=>f.flush());assert.deepEqual(f.focused,[{id:'two',options:{preventScroll:true}}]);assert.deepEqual(f.scrolls,[{top:550,behavior:'smooth'}]);}finally{await f.close();}
});
test('TOC unmount cancels the iframe callback before it can focus removed content; reduced motion remains immediate',async()=>{
 const f=await fixture(true);await act(async()=>f.click(0));await act(async()=>f.flush());assert.equal(f.scrolls[0].behavior,'auto');await act(async()=>f.click(1));assert.equal(f.pending.size,1);await f.close();assert.equal(f.pending.size,0);f.flush();assert.equal(f.focused.length,1);assert.deepEqual(f.parentCancels,[]);
});
test('a closing narrow directory does not shift the final reading target beneath the header',async()=>{
 const f=await fixture(false,148);try{await act(async()=>f.click(1));await act(async()=>f.flush());assert.deepEqual(f.scrolls,[{top:402,behavior:'smooth'}]);assert.deepEqual(f.focused,[{id:'two',options:{preventScroll:true}}]);}finally{await f.close();}
});

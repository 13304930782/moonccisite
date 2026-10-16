const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
test('reading panel handles its own unhandled Escape while preserving Radix and nested dialog ownership',()=>{
 let state=0;const changes=[],React=require('react'),imports={
  react:{...React,useEffect(){},useLayoutEffect(){},useRef:value=>({current:value}),useState:init=>{const index=state++;return [typeof init==='function'?init():init,value=>{if(index===1)changes.push(value);}];}},
  'react-router-dom':{useLocation:()=>({pathname:'/article/test',search:''})},'../context/ThemeContext':{useMoonTheme:()=>({setTheme(){}})},'../lib/motionPreference':{syncMotionPreference(){}},
  '@radix-ui/react-dialog':Object.fromEntries(['Root','Portal','Overlay','Content','Title','Close'].map(name=>[name,name])),
 };
 const module={exports:{}},code=ts.transpileModule(fs.readFileSync('src/app/components/ReadingTools.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('exports','require','window',code)(module.exports,name=>name.endsWith('.css')?{}:imports[name]||require(name),{});
 const find=node=>!node?undefined:node.type==='Content'?node:Array.isArray(node)?node.map(find).find(Boolean):find(node.props?.children);
 const content=find(module.exports.default()),owner={},nested={};let prevented=0;
 const event=(key='Escape',handled=false,target=owner)=>({key,defaultPrevented:handled,target:{closest:()=>target},currentTarget:owner,preventDefault(){prevented++;}});
 content.props.onKeyDown(event('Enter'));content.props.onKeyDown(event('Escape',true));content.props.onKeyDown(event('Escape',false,nested));assert.deepEqual(changes,[]);assert.equal(prevented,0);
 content.props.onKeyDown(event());assert.deepEqual(changes,[false]);assert.equal(prevented,1);
});

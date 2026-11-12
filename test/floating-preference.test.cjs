const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');

test('navigation effects default on while saved choices remain unchanged',()=>{
 const source=fs.readFileSync('src/app/lib/floatingPreference.ts','utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const storage=new Map(),mod={exports:{}};
 const localStorage={getItem:key=>storage.has(key)?storage.get(key):null,setItem:(key,value)=>storage.set(key,value)};
 const window={dispatchEvent(){},addEventListener(){},removeEventListener(){}};
 new Function('require','module','exports','localStorage','window','Event',code)(require,mod,mod.exports,localStorage,window,Event);
 const {getNavigationMotion,setNavigationMotion}=mod.exports;
 assert.equal(getNavigationMotion(),3);
 for(const value of [0,1,2,3]){setNavigationMotion(value);assert.equal(getNavigationMotion(),value);}
});

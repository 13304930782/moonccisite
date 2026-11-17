const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');

test('writing toolbar offset follows the rendered header through language, viewport and zoom reflow',()=>{
 const source=ts.createSourceFile('AdminWritePage.tsx',fs.readFileSync('src/app/pages/AdminWritePage.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let effect;
 function visit(node){
  if(ts.isCallExpression(node)&&node.expression.getText(source)==='useEffect'&&node.arguments[0]?.getText(source).includes("setProperty('--writing-toolbar-top'"))effect=node.arguments[0].getText(source);
  ts.forEachChild(node,visit);
 }
 visit(source);assert.ok(effect,'header measurement effect exists');
 const code=ts.transpileModule(`const setup=${effect};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 let height=104,resize,observed,disconnected=false;
 const properties=new Map(),header={getBoundingClientRect:()=>({height})};
 const root={querySelector:selector=>selector==='.writing-topbar'?header:null,style:{setProperty:(key,value)=>properties.set(key,value),removeProperty:key=>properties.delete(key)}};
 const workspace={current:root};
 class ResizeObserver {constructor(callback){resize=callback;}observe(element){observed=element;}disconnect(){disconnected=true;}}
 const setup=new Function('workspace','ResizeObserver',code+'return setup;')(workspace,ResizeObserver);
 const cleanup=setup();assert.equal(observed,header);assert.equal(properties.get('--writing-toolbar-top'),'104px');
 for(const next of [136,72,148.5]){height=next;resize();assert.equal(properties.get('--writing-toolbar-top'),next+'px');}
 cleanup();assert.equal(disconnected,true);assert.equal(properties.has('--writing-toolbar-top'),false);
 workspace.current=null;assert.equal(setup(),undefined,'published screen has no editing header');
 workspace.current={querySelector:()=>null};assert.equal(setup(),undefined,'missing header is safe');
});

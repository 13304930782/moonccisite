const React=require('react'),fs=require('node:fs'),ts=require('typescript');
const result={};
const code=ts.transpileModule(fs.readFileSync('src/app/lib/useContentListQuery.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('exports','require',code)(result,name=>name==='react-router-dom'?{useSearchParams:()=>React.useState(()=>new URLSearchParams())}:require(name));
module.exports=result;

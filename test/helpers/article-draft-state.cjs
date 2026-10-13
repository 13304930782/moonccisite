const fs=require('node:fs'),ts=require('typescript'),mod={exports:{}};
const code=ts.transpileModule(fs.readFileSync('src/app/lib/articleDraftState.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
new Function('exports','module',code)(mod.exports,mod);
module.exports=mod.exports;

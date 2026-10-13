// Load the same date/text policy used in the browser; do not duplicate its rules.
const fs=require('node:fs'),ts=require('typescript');
const loaded={exports:{}};
new Function('exports','module',ts.transpileModule(fs.readFileSync('src/app/lib/articleAge.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(loaded.exports,loaded);
module.exports=loaded.exports;

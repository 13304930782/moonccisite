// Isolated component tests use the production translator and catalogs, without
// mounting BrowserRouter or fetching language assets. Routing has separate tests.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react');
const root=path.resolve(__dirname,'../..');
const context={useLocale:()=>({uiLocale:'zh-CN',contentLocale:'zh-CN',setLocale:async()=>{}})};
const translation={exports:{}};
const source=fs.readFileSync(path.join(root,'src/app/i18n/index.ts'),'utf8').replace(/import\.meta\.env\.DEV/g,'false');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('module','exports','require',code)(translation,translation.exports,name=>name.endsWith('LocaleContext')?context:name.endsWith('?url')?{default:name}:require(name));
translation.exports.seedChineseMessages(require('../../src/app/i18n/zh.json'));
translation.exports.seedEnglishMessages(require('../../src/app/i18n/en.json'));
const locale={};new Function('exports',ts.transpileModule(fs.readFileSync(path.join(root,'src/app/lib/locale.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(locale);
const links={Link:({to,children,...props})=>React.createElement('a',{...props,href:typeof to==='string'?to:to.pathname},children)};
function fixture(name){
 if(typeof name!=='string')return undefined;
 if(name.endsWith('/locale'))return locale;
 if(name.endsWith('/ContentTranslationEditor'))return {ContentTranslationEditor:()=>null,TranslationFields:()=>null,TaxonomyTranslations:()=>null};
 if(/(?:^|\/)i18n(?:\/index)?$/.test(name))return translation.exports;
 if(name.endsWith('/LanguageSwitch'))return {LanguageSwitch:()=>null};
 if(name.endsWith('/LocaleContext'))return context;
 if(name.endsWith('/LocaleLink'))return links;
 return undefined;
}
module.exports={fixture,...translation.exports};

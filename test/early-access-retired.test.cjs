const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const read=p=>fs.readFileSync(p,'utf8');
test('retired Early Access routes show notice with no application or review calls',()=>{
 const box={exports:{}};const code=ts.transpileModule(read('src/app/pages/EarlyAccessPage.tsx'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('exports','require',code)(box.exports,name=>name.endsWith('/i18n')?{useI18n:()=>({t:x=>x})}:name.endsWith('/LocaleLink')?{Link:({to,children,...props})=>React.createElement('a',{href:to,...props},children)}:name.endsWith('/ContentUI')?{SitePage:({children})=>React.createElement('main',null,children),PageHeading:({title,children})=>React.createElement('header',null,React.createElement('h1',null,title),children)}:require(name));
 for(const admin of [false,true]){const html=renderToStaticMarkup(React.createElement(box.exports.default,{admin}));assert.match(html,/此功能已下线/);assert.doesNotMatch(html,/<form|<input/);assert.ok(html.includes('href="'+(admin?'/admin':'/')+'"'));}
 const routes=read('src/app/RoutePages.tsx');assert.doesNotMatch(routes,/import\('\.\/pages\/AdminEarlyAccess/);assert.equal((routes.match(/<EarlyAccessPage admin \/>/g)||[]).length,2);
 for(const file of ['components/admin/AdminShell.tsx','pages/HomePage.tsx','pages/ProjectsPage.tsx'])assert.doesNotMatch(read('src/app/'+file),/to:[ ]*['"]\/admin\/early-access|to="\/early-access"/);
 assert.match(read('src/app/components/Header.tsx'),/https:\/\/cuegroveapp\.com/);
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const {JSDOM}=require('jsdom');
const {fixture,translate}=require('./helpers/i18n.cjs');

const source=ts.createSourceFile('ContentUI.tsx',fs.readFileSync('src/app/components/ContentUI.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const labels=source.statements.filter(ts.isVariableStatement).flatMap(node=>node.declarationList.declarations).find(node=>node.name.getText(source)==='labels');
const contentLabels=new Function('return '+labels.initializer.getText(source))();
function load(file,locale){
 const mod={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>{
  if(name.endsWith('/i18n'))return {useI18n:()=>({t:(key,params)=>translate(locale,key,params),locale})};
  if(name.endsWith('/ContentUI'))return {labels:contentLabels};
  if(name.endsWith('.css'))return {};
  if(/\.(png|webp|svg)$/.test(name))return name;
  if(fixture(name))return fixture(name);
  return name.startsWith('.')?load(path.resolve(path.dirname(file),name)+'.ts',locale):require(name);
 },mod,mod.exports);
 return mod.exports;
}

test('populated regular and featured project cards translate stage without changing content or language URL',()=>{
 for(const locale of ['zh-CN','en']){
  const {ProjectCard}=load('src/app/components/ProjectCard.tsx',locale);
  for(const featured of [false,true])for(const [stage,label] of Object.entries({building:'In development',active:'Actively maintained',maintenance:'Maintenance',archived:'Archived'})){
   const project={id:8,slug:'sample-app',name:'Sample App',summary:'A useful app.',tech_stack:'React',stage,content_locale:'en',icon_url:'/icon.png'};
   const before=JSON.stringify(project);
   const dom=new JSDOM(renderToStaticMarkup(React.createElement(ProjectCard,{project,featured})));
   try{
    const doc=dom.window.document;
    assert.equal(doc.querySelector('.eyebrow').textContent,locale==='en'?label:contentLabels[stage]);
    assert.equal(doc.querySelector('h3').textContent,project.name);
    assert.equal(doc.querySelector('a').getAttribute('href'),'/en/projects/sample-app');
    assert.equal(JSON.stringify(project),before);
   }finally{dom.window.close();}
  }
 }
});

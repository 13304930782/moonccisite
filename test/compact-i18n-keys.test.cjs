const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');

test('short keys preserve exact values and leave other text untouched',async()=>{
 const {shortMessageKey,compactCatalog,compactMessageSource,createMessageKeyMap}=await import('../scripts/compact-i18n-keys.mjs');
 const key='m_0123456789', zh={[key]:'文章',m_aaaaaaaaaa:'你好'};
 const map=createMessageKeyMap(zh), short=shortMessageKey(key,map), compact=compactCatalog(zh,map);
 assert.equal(short.length,3);assert.match(short,/^~[A-Za-z0-9_-]{2}$/);assert.equal(compact[short],'文章');assert.notEqual(short,shortMessageKey('m_012345678a',map));
 const source=`// ${key}\nconst a="${key}"; const b='m_fffffffffe'; const c='text ${key}'; const d=\`m_\${value}\`;`;
 const result=compactMessageSource(source,'sample.ts',zh);
 assert.ok(result.includes(`const a="${short}"`));assert.ok(result.includes(`// ${key}`));assert.ok(result.includes("'m_fffffffffe'"));assert.ok(result.includes(`'text ${key}'`));assert.ok(result.includes('`m_${value}`'));
});

test('compact catalog preserves zh and en translation mapping',async()=>{
 const {shortMessageKey,compactCatalog,createMessageKeyMap}=await import('../scripts/compact-i18n-keys.mjs');
 const zh=require('../src/app/i18n/zh.json'),en=require('../src/app/i18n/en.json'),compressed=compactCatalog(zh);
 const map=createMessageKeyMap(zh);
 assert.equal(new Set(Object.keys(zh).map(key=>shortMessageKey(key,map))).size,Object.keys(zh).length,'Compacted keys must not collide with each other or unchanged catalog keys');
 for(const [key,value] of Object.entries(zh)){
  assert.equal(compressed[shortMessageKey(key,map)],value);
  if(en[value]) assert.equal(en[compressed[shortMessageKey(key,map)]],en[value]);
 }
});

test('ordinal maps are deterministic, grow beyond two digits, and reject untouched-key collisions',async()=>{
 const {createMessageKeyMap,compactCatalog}=await import('../scripts/compact-i18n-keys.mjs');
 const entries=Array.from({length:4097},(_,i)=>[`m_${i.toString(16).padStart(10,'0')}`,`message ${i}`]);
 const catalog=Object.fromEntries(entries),map=createMessageKeyMap(catalog);
 assert.deepEqual([...map],[...createMessageKeyMap(Object.fromEntries([...entries].reverse()))]);
 assert.equal(map.get(entries[0][0]),'~AA');
 assert.equal(map.get(entries[4095][0]),'~--');
 assert.equal(map.get(entries[4096][0]),'~BAA');
 const compact=compactCatalog(catalog,map);
 assert.equal(Object.keys(compact).length,entries.length);
 for(const [key,value] of entries)assert.equal(compact[map.get(key)],value);
 assert.throws(()=>compactCatalog({m_0000000000:'hashed','~AA':'unchanged'}),/collides/);
});

async function translators() {
 const ts=require('typescript'),{compactI18nKeys}=await import('../scripts/compact-i18n-keys.mjs');
 const filename=path.resolve('src/app/i18n/index.ts'),source=fs.readFileSync(filename,'utf8');
 const plugin=compactI18nKeys();plugin.configResolved({root:process.cwd()});
 assert.equal(plugin.apply,'build');
 const transformed=plugin.transform(source,filename);
 assert.ok(transformed,'The build translator must recognize compacted keys');
 function load(code) {
  const module={exports:{}};
  code=ts.transpileModule(code.replace(/import\.meta\.env\.DEV/g,'false'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('exports','require',code)(module.exports,name=>name.endsWith('?url')?{default:name}:name.endsWith('LocaleContext')?{useLocale:()=>({uiLocale:'zh-CN'})}:require(name));
  return module.exports;
 }
 return {original:load(source),built:load(transformed.code)};
}

test('build translator preserves bilingual interpolation and original SSR output after catalog seeding',async()=>{
 const {shortMessageKey,compactCatalog,createMessageKeyMap}=await import('../scripts/compact-i18n-keys.mjs');
 const {original,built}=await translators(),zh=require('../src/app/i18n/zh.json'),en=require('../src/app/i18n/en.json');
 const map=createMessageKeyMap(zh); original.seedChineseMessages(zh);original.seedEnglishMessages(en);
 built.seedChineseMessages(compactCatalog(zh));
 const first=Object.keys(zh).find(key=>/^m_[a-f0-9]{10}$/.test(key));
 assert.equal(built.translate('zh-CN',shortMessageKey(first,map)),original.translate('zh-CN',first),'Chinese works before the English catalog is loaded');
 built.seedEnglishMessages(en);
 for(const [key,value] of Object.entries(zh)){
  const params=Object.fromEntries([...value.matchAll(/\{(\w+)\}/g)].map(match=>[match[1],'<b>literal fixture</b>']));
  for(const locale of ['zh-CN','en'])assert.equal(built.translate(locale,shortMessageKey(key,map),params),original.translate(locale,key,params),`${locale}: ${key}`);
 }
});

test('build translator keeps loading fallbacks for original and compact keys before catalogs are ready',async()=>{
 const {shortMessageKey,createMessageKeyMap}=await import('../scripts/compact-i18n-keys.mjs');
 const {original,built}=await translators(),key='m_0123456789';
 for(const locale of ['zh-CN','en']){
  assert.equal(built.translate(locale,key),original.translate(locale,key));
  assert.equal(built.translate(locale,shortMessageKey(key)),original.translate(locale,key));
  assert.equal(built.translate(locale,shortMessageKey(key,createMessageKeyMap({[key]:'文章'}))),original.translate(locale,key));
  assert.equal(built.translate(locale,'~short'),'~short');
  assert.equal(built.translate(locale,null),'');
 }
});

test('Vite hashes the transformed catalog content',async()=>{
 const {build}=await import('vite');const {compactI18nKeys}=await import('../scripts/compact-i18n-keys.mjs');
 const root=fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()),'mooncci-short-catalog-'));
 try {
  fs.mkdirSync(path.join(root,'src/app/i18n'),{recursive:true});
  fs.writeFileSync(path.join(root,'index.html'),'<script type="module" src="/src/main.ts"></script>');
  fs.writeFileSync(path.join(root,'src/main.ts'),"import url from './app/i18n/index'; console.log(url);");
  fs.writeFileSync(path.join(root,'src/app/i18n/index.ts'),"import url from './zh.json?url'; export default url;");
  const catalog=path.join(root,'src/app/i18n/zh.json');let assets=[];
  for(const value of ['文章','新文章']){
   fs.writeFileSync(catalog,JSON.stringify({m_0123456789:value}));
   await build({root,configFile:false,plugins:[compactI18nKeys()],logLevel:'silent',build:{outDir:'dist',emptyOutDir:true}});
   const file=fs.readdirSync(path.join(root,'dist/assets')).find(x=>/^zh-compact-.*\.json$/.test(x));
   assert.ok(file);assert.deepEqual(Object.values(JSON.parse(fs.readFileSync(path.join(root,'dist/assets',file),'utf8'))),[value]);assets.push(file);
  }
  assert.notEqual(assets[0],assets[1]);
 } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');

test('short keys preserve exact values and leave other text untouched',async()=>{
 const {shortMessageKey,compactCatalog,compactMessageSource}=await import('../scripts/compact-i18n-keys.mjs');
 const key='m_0123456789', zh={[key]:'文章',m_aaaaaaaaaa:'你好'};
 const short=shortMessageKey(key), compact=compactCatalog(zh);
 assert.equal(short.length,9);assert.equal(compact[short],'文章');assert.notEqual(short,shortMessageKey('m_012345678a'));
 const source=`// ${key}\nconst a="${key}"; const b='m_fffffffffe'; const c='text ${key}'; const d=\`m_\${value}\`;`;
 const result=compactMessageSource(source,'sample.ts',zh);
 assert.ok(result.includes(`const a="${short}"`));assert.ok(result.includes(`// ${key}`));assert.ok(result.includes("'m_fffffffffe'"));assert.ok(result.includes(`'text ${key}'`));assert.ok(result.includes('`m_${value}`'));
});

test('compact catalog preserves zh and en translation mapping',async()=>{
 const {shortMessageKey,compactCatalog}=await import('../scripts/compact-i18n-keys.mjs');
 const zh=require('../src/app/i18n/zh.json'),en=require('../src/app/i18n/en.json'),compressed=compactCatalog(zh);
 for(const [key,value] of Object.entries(zh)){
  assert.equal(compressed[shortMessageKey(key)],value);
  if(en[value]) assert.equal(en[compressed[shortMessageKey(key)]],en[value]);
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

const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const verifier=require('./verify-bilingual-release.cjs');
const {tempFiles}=require('./cleanup-motion-seo.cjs');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const put=(file,bytes)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes)};

test('baseline drift stops release; simulated partial install restores original files',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'motion-release-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const folder=path.join(root,'package'),live=path.join(root,'live'),web=path.join(root,'web'),backup=path.join(root,'backup');
 fs.mkdirSync(backup,{recursive:true});
 const files={'dist/index.html':'new index','dist/assets/new.js':'new asset','server/src/index.js':'new backend','server/runtime/document.mjs':'new ssr'};
 const before={'dist/index.html':'old index','dist/assets/new.js':null,'server/src/index.js':'old backend','server/runtime/document.mjs':'old ssr'};
 for(const [name,bytes] of Object.entries(files))put(path.join(folder,name),bytes);
 for(const [name,bytes] of Object.entries(before))if(bytes!==null)put(verifier.target(name,live,web,{}),bytes);
 put(path.join(web,'assets/old.js'),'retain old hashed asset');
 for(const name of ['package.json','package-lock.json'])put(path.join(live,name),'{}');
 for(const name of ['verify-bilingual-release.cjs','rollback-bilingual.sh'])put(path.join(folder,name),'test helper');
 put(path.join(folder,'MANIFEST.json'),JSON.stringify({version:1,files:Object.fromEntries(Object.entries(files).map(([n,b])=>[n,sha(b)]))}));
 put(path.join(folder,'BASELINE.json'),JSON.stringify({version:1,captured_at:new Date().toISOString(),files:Object.fromEntries(Object.entries(before).map(([n,b])=>[n,b===null?null:sha(b)])),prerequisites:{'package.json':sha('{}'),'package-lock.json':sha('{}')}}));
 verifier.verify(folder,live,web,false,{});
 put(path.join(live,'src/index.js'),'unexpected change');
 assert.throws(()=>verifier.verify(folder,live,web,false,{}),/Production drift/);
 put(path.join(live,'src/index.js'),'old backend');
 verifier.snapshot(folder,backup,live,web,{});
 for(const [name,bytes] of Object.entries(files))put(verifier.target(name,live,web,{}),bytes);
 const manifest=JSON.parse(fs.readFileSync(path.join(folder,'MANIFEST.json'),'utf8'));
 const leftover=path.join(live,'src/index.js.bilingual-new');put(leftover,'partially written');
 assert.throws(()=>tempFiles(manifest,false,live,web),/Stale release temporary/);
 tempFiles(manifest,true,live,web);assert.equal(fs.existsSync(leftover),false);
 put(path.join(backup,'before/server/src/index.js'),'corrupt backup');
 assert.throws(()=>verifier.restore(backup,false,live,web,{}),/Corrupt rollback backup/);
 put(path.join(backup,'before/server/src/index.js'),'old backend');
 verifier.restore(backup,false,live,web,{});
 for(const [name,bytes] of Object.entries(before)){
  const file=verifier.target(name,live,web,{});
  if(bytes===null)assert.equal(fs.existsSync(file),false);else assert.equal(fs.readFileSync(file,'utf8'),bytes);
 }
 assert.equal(fs.readFileSync(path.join(web,'assets/old.js'),'utf8'),'retain old hashed asset');
});

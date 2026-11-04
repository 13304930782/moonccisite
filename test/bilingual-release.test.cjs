const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const release=require('../scripts/verify-bilingual-release.cjs');
test('bilingual scoped install baseline and rollback preserve environment, dependencies, old assets, translations',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bilingual-release-'));try{
 const live=path.join(root,'live'),web=path.join(root,'web'),pkg=path.join(root,'pkg'),backup=path.join(root,'backup');
 for(const p of [live,web,pkg,backup])fs.mkdirSync(p);
 const put=(p,v)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,v)};
 const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
 const files={'server/src/new.js':'new backend','server/runtime/document.mjs':'new render','dist/index.html':'new index','dist/assets/new.js':'new asset','server/database/migrations/new.sql':'new migration'};
 const before={};for(const [name,value]of Object.entries(files)){put(path.join(pkg,name),value);const dst=release.target(name,live,web);if(!name.includes('/new'))put(dst,'old '+value);before[name]=fs.existsSync(dst)?sha(fs.readFileSync(dst)):null;}
 for(const name of ['package.json','package-lock.json'])put(path.join(live,name),'{}');
 put(path.join(live,'.env'),'private config');put(path.join(live,'runtime/node_modules/jsdom/keep'),'dependency');put(path.join(web,'assets/old.js'),'old asset');
 const manifest={version:1,files:Object.fromEntries(Object.entries(files).map(([n,v])=>[n,sha(v)]))};
 const baseline={version:1,captured_at:new Date().toISOString(),files:before,prerequisites:{'package.json':sha('{}'),'package-lock.json':sha('{}')}};
 put(path.join(pkg,'MANIFEST.json'),JSON.stringify(manifest));put(path.join(pkg,'BASELINE.json'),JSON.stringify(baseline));for(const f of ['verify-bilingual-release.cjs','rollback-bilingual.sh'])put(path.join(pkg,f),'helper');
 assert.doesNotThrow(()=>release.verify(pkg,live,web));release.snapshot(pkg,backup,live,web);
 for(const [n,v]of Object.entries(files))put(release.target(n,live,web),v);
 assert.doesNotThrow(()=>release.verify(pkg,live,web,true));
 assert.throws(()=>release.restore(backup,true,live,web),/already started/);
 assert.equal(fs.readFileSync(path.join(live,'src/new.js'),'utf8'),'new backend');assert.equal(fs.readFileSync(path.join(web,'index.html'),'utf8'),'new index');assert.ok(fs.existsSync(path.join(web,'assets/new.js')));
 assert.equal(fs.readFileSync(path.join(live,'database/migrations/new.sql'),'utf8'),'new migration');assert.equal(fs.readFileSync(path.join(live,'.env'),'utf8'),'private config');assert.equal(fs.readFileSync(path.join(live,'runtime/node_modules/jsdom/keep'),'utf8'),'dependency');assert.equal(fs.readFileSync(path.join(web,'assets/old.js'),'utf8'),'old asset');
 release.restore(backup,false,live,web);assert.ok(!fs.existsSync(path.join(live,'src/new.js')));assert.equal(fs.readFileSync(path.join(web,'index.html'),'utf8'),'old new index');assert.ok(!fs.existsSync(path.join(web,'assets/new.js')));
 put(path.join(web,'index.html'),'unexpected');assert.throws(()=>release.verify(pkg,live,web),/drift/);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('release destinations reject traversal, private files and dependency overwrite',()=>{
 for(const n of ['../escape','/root/escape','src/../.env'])assert.throws(()=>release.safe('/tmp',n));
 for(const n of ['server/.env','server/node_modules/mysql2/index.js','server/runtime/node_modules/jsdom/index.js','server/runtime/deployment.json','ops/unknown.conf'])assert.throws(()=>release.target(n));
 assert.equal(release.target('ops/indexnow.py').replace(/\\/g,'/').replace(/^[A-Za-z]:/,''),'/opt/mooncci-indexnow/indexnow.py');
});
test('scoped operations files are baseline checked and restored with executable mode',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bilingual-ops-'));
 try{
  const live=path.join(root,'live'),web=path.join(root,'web'),pkg=path.join(root,'pkg'),backup=path.join(root,'backup'),dest=path.join(root,'ops','indexnow.py');
  for(const p of [live,web,pkg,backup,path.dirname(dest),path.join(pkg,'ops')])fs.mkdirSync(p,{recursive:true});
  const sha=v=>crypto.createHash('sha256').update(v).digest('hex'),ops={'ops/indexnow.py':dest};
  fs.writeFileSync(dest,'old ops');fs.chmodSync(dest,0o755);fs.writeFileSync(path.join(pkg,'ops/indexnow.py'),'new ops');
  for(const n of ['package.json','package-lock.json'])fs.writeFileSync(path.join(live,n),'{}');
  fs.writeFileSync(path.join(pkg,'MANIFEST.json'),JSON.stringify({version:1,files:{'ops/indexnow.py':sha('new ops')}}));
  fs.writeFileSync(path.join(pkg,'BASELINE.json'),JSON.stringify({version:1,captured_at:new Date().toISOString(),files:{'ops/indexnow.py':sha('old ops')},prerequisites:{'package.json':sha('{}'),'package-lock.json':sha('{}')}}));
  for(const n of ['verify-bilingual-release.cjs','rollback-bilingual.sh'])fs.writeFileSync(path.join(pkg,n),'helper');
  release.snapshot(pkg,backup,live,web,ops);fs.writeFileSync(dest,'new ops');
  assert.throws(()=>release.restore(backup,true,live,web,ops),/already started/);assert.equal(fs.readFileSync(dest,'utf8'),'new ops');
  release.restore(backup,false,live,web,ops);assert.equal(fs.readFileSync(dest,'utf8'),'old ops');if(process.platform!=='win32')assert.equal(fs.statSync(dest).mode&0o777,0o755);
  fs.writeFileSync(dest,'drift');assert.throws(()=>release.verify(pkg,live,web,false,ops),/drift/);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('new directories are readable despite umask 077, with existing parent permissions unchanged',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bilingual-permissions-')),oldMask=process.umask(0o077);
 try {
  const source=path.join(root,'source');fs.writeFileSync(source,'payload');fs.chmodSync(root,0o700);
  const before=fs.statSync(root).mode,owner=fs.statSync(root),calls=[];
  const chmod=fs.chmodSync,chown=fs.chownSync;
  t.mock.method(fs,'chmodSync',(file,mode)=>{calls.push(['chmod',file,mode]);return chmod(file,mode)});
  t.mock.method(fs,'chownSync',(file,uid,gid)=>{calls.push(['chown',file,uid,gid]);return chown(file,uid,gid)});
  const target=path.join(root,'new','nested','file');release.copy(source,target,owner);
  for(const dir of [path.join(root,'new'),path.join(root,'new','nested')]){
   assert.ok(calls.some(c=>c[0]==='chmod'&&c[1]===dir&&c[2]===0o755));
   assert.ok(calls.some(c=>c[0]==='chown'&&c[1]===dir&&c[2]===owner.uid&&c[3]===owner.gid));
   if(process.platform!=='win32')assert.equal(fs.statSync(dir).mode&0o777,0o755);
  }
  assert.equal(fs.statSync(root).mode,before);assert.ok(!calls.some(c=>c[1]===root));assert.equal(fs.readFileSync(target,'utf8'),'payload');
 }finally{process.umask(oldMask);t.mock.restoreAll();fs.rmSync(root,{recursive:true,force:true})}
});
test('database dump validation rejects truncated backups and missing original rows',()=>{
 const dump=Buffer.from('CREATE TABLE `posts` (id INT);\nINSERT INTO `posts` VALUES (1);\n-- Dump completed on 2026-11-04\n');
 assert.doesNotThrow(()=>release.inspectDump(dump,['posts'],{posts:'1'}));
 assert.throws(()=>release.inspectDump(dump,['posts'],{posts:'2'}),/row count/);
 assert.throws(()=>release.inspectDump(dump.subarray(0,60),['posts'],{posts:'1'}),/Incomplete/);
 assert.throws(()=>release.inspectDump(dump,['posts','users'],{posts:'1'}),/Incomplete/);
});

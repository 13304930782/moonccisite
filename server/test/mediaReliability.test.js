const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {mediaFileTransaction}=require('../src/lib/mediaFileTransaction');
const {countReferences,remapPayload}=require('../src/lib/mediaReferences');
test('reference guard includes unpublished consumers and history; underscores stay literal',async()=>{
 const visited=[],url='/api/uploads/used_image.png';
 const rows={posts:[{content:url+'-other.webp',cover_image:''}],site_settings:[{setting_value:JSON.stringify({title:url,avatar_url:url+'-other.webp'})}],
  updates:[{content:'![image]('+url+')',image_url:url}],projects:[{content:'',cover_image:'',icon_image:url}],site_now:[{content:'https://other.invalid'+url}],article_series:[],
  article_drafts:[{payload:{content:url}}],article_revisions:[{payload:JSON.stringify({cover_image:url})}],article_workflows:[{snapshot:{content:url}}]};
 const total=await countReferences({query:async(sql,args)=>{const table=sql.match(/FROM (\w+)/)[1];visited.push(table);assert(args.every(x=>x===url));return [rows[table]];}},url);
 assert.equal(total,5);assert.deepEqual(visited,['posts','site_settings','updates','projects','site_now','article_series','article_drafts','article_revisions','article_workflows']);
});
test('media relocation preserves a valid AI receipt and never legitimizes an invalid one',()=>{
 process.env.JWT_SECRET='isolated-media-proof-secret-at-least-32-characters';
 const proof=require('../src/lib/articleSummaryProof');
 const before={title:'title',content:'![image](/api/uploads/old.png)',category:'test',tags:[],summary:'summary',summary_mode:'ai',cover_image:'/api/uploads/old.png',cover_crop:{x:.2,y:.4}};
 before.summary_receipt=proof.signature(before);
 const next=remapPayload(JSON.stringify(before),'/api/uploads/old.png','/api/uploads/new.png');
 assert.equal(proof.valid(next),true);assert.equal(next.summary,before.summary);assert.deepEqual(next.cover_crop,before.cover_crop);assert.equal(proof.valid(before),true);
 assert.equal(proof.valid(remapPayload({...before,summary_receipt:'f'.repeat(64)},'/api/uploads/old.png','/api/uploads/new.png')),false);
});
test('URL relocation does not rewrite a different asset sharing the same filename prefix',()=>{
 const value={content:'![one](/api/uploads/a.png) ![two](/api/uploads/a.png-other.webp)',cover_image:'/api/uploads/a.png-other.webp'};
 assert.deepEqual(remapPayload(value,'/api/uploads/a.png','/api/uploads/new.png'),{content:'![one](/api/uploads/new.png) ![two](/api/uploads/a.png-other.webp)',cover_image:value.cover_image});
});
function fakeDb({commit=async()=>{},rollback=async()=>{}}={}){
 const events=[];return {events,getConnection:async()=>({beginTransaction:async()=>events.push('begin'),query:async()=>{events.push('lock');return [[]]},commit:async()=>{events.push('commit');await commit()},rollback:async()=>{events.push('rollback');await rollback();},destroy:()=>events.push('destroy'),release:()=>events.push('release')})};
}
test('database failure after rename restores the original file and removes the new path',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'media-rollback-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const old=path.join(dir,'old.png'),next=path.join(dir,'new.png');await fs.writeFile(old,'original bytes');const db=fakeDb();
 await assert.rejects(mediaFileTransaction(db,dir,[old,next],async(_c,journal)=>{journal.changed(old);await fs.rename(old,next);journal.created(next);throw Error('DB write failed')}),/DB write failed/);
 assert.equal(await fs.readFile(old,'utf8'),'original bytes');await assert.rejects(fs.access(next));assert.deepEqual(await fs.readdir(path.join(dir,'.mutations')),[]);assert.deepEqual(db.events,['begin','lock','rollback','release']);
});
test('failed same-name compression restores full original bytes and removes temporary output',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'media-compression-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'image.webp'),tmp=file+'.tmp';await fs.writeFile(file,'full original bytes');
 await assert.rejects(mediaFileTransaction(fakeDb(),dir,[file,tmp],async(_c,journal)=>{journal.changed(file);await fs.writeFile(file,'compressed');await fs.writeFile(tmp,'partial');journal.created(tmp);throw Error('metadata failed')}),/metadata failed/);
 assert.equal(await fs.readFile(file,'utf8'),'full original bytes');await assert.rejects(fs.access(tmp));
});
test('a failed operation never removes a destination created by a competing request',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'media-collision-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const old=path.join(dir,'old.png'),next=path.join(dir,'new.png');await fs.writeFile(old,'original');
 await assert.rejects(mediaFileTransaction(fakeDb(),dir,[old,next],async()=>{await fs.writeFile(next,'other request');throw Error('destination already exists')}),/destination already exists/);
 assert.equal(await fs.readFile(old,'utf8'),'original');assert.equal(await fs.readFile(next,'utf8'),'other request');
});
test('lost COMMIT response retains both usable URLs and a private recovery copy',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'media-commit-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const old=path.join(dir,'old.png'),next=path.join(dir,'new.png');await fs.writeFile(old,'original');
 await assert.rejects(mediaFileTransaction(fakeDb({commit:async()=>{throw Error('connection lost')}}),dir,[old,next],async()=>fs.rename(old,next)),e=>e.status===503);
 assert.equal(await fs.readFile(old,'utf8'),'original');assert.equal(await fs.readFile(next,'utf8'),'original');assert.equal((await fs.readdir(path.join(dir,'.mutations'))).length,1);
});
test('successful mutation commits before removing recovery files',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'media-success-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'image.webp');await fs.writeFile(file,'original');const db=fakeDb();
 assert.equal(await mediaFileTransaction(db,dir,[file],async()=>{await fs.writeFile(file,'compressed');return 'done'}),'done');
 assert.equal(await fs.readFile(file,'utf8'),'compressed');assert.deepEqual(await fs.readdir(path.join(dir,'.mutations')),[]);assert.deepEqual(db.events,['begin','lock','commit','release']);
});
test('declared trash moves participate in rollback while dynamically created paths stay in uploads',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'media-trash-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));await fs.mkdir(path.join(dir,'.trash'));
 const file=path.join(dir,'image.webp'),trash=path.join(dir,'.trash/image.webp');await fs.writeFile(file,'original');
 await assert.rejects(mediaFileTransaction(fakeDb(),dir,[file,trash],async(_c,journal)=>{journal.changed(file);await fs.rename(file,trash);journal.created(trash);throw Error('metadata failed')}),/metadata failed/);
 assert.equal(await fs.readFile(file,'utf8'),'original');await assert.rejects(fs.access(trash));
});
test('upload callback forwards a metadata failure to Express without an unhandled rejection',async()=>{
 const source=require('node:fs').readFileSync(path.join(__dirname,'../src/routes/upload.js'),'utf8');
 const snippet=source.slice(source.indexOf("router.post('/image'"),source.indexOf('module.exports ='));
 let handler;const vm=require('node:vm'),error=Error('metadata unavailable');
 const scope={router:{post:(_path,...handlers)=>{handler=handlers.at(-1)}},authRequired:()=>{},contributor:()=>{},require:()=>()=>()=>{},upload:{single:()=> (_req,_res,callback)=>callback(null)},getDetectedImageInfo:async()=>({ok:true}),checkedUploadPath:()=>'/fixture',normalizeQuality:()=> 'original',compressImageIfNeeded:async()=>({quality:'original'}),getImageMeta:async()=>({}),upsertMediaRecord:async()=>{throw error},path,console};
 vm.runInNewContext(snippet,scope);
 const received=await new Promise(resolve=>handler({file:{filename:'fixture.png',originalname:'fixture.png'},body:{},user:{id:1}},{status(){return this},json(){}},resolve));
 assert.equal(received,error);
});

const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'media-coordination-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}

test('directory mutex spans SQL rollback and disk recovery across processes, then permits the next write',async t=>{
 const dir=await fixture(t),file=path.join(dir,'image.webp');await fs.writeFile(file,'original');
 const restoring=deferred(),resume=deferred(),copy=fs.copyFile;
 fs.copyFile=async(source,dest,...args)=>{if(dest===file){restoring.resolve();await resume.promise;}return copy(source,dest,...args);};
 try{
  const failed=mediaFileTransaction(fakeDb(),dir,[file],async(_c,journal)=>{journal.changed(file);await fs.writeFile(file,'failed compression');throw Error('metadata failed');});
  const rejected=assert.rejects(failed,/metadata failed/);await restoring.promise;
  const code=`const {mediaFileTransaction}=require(process.argv[1]);mediaFileTransaction({getConnection:async()=>{throw Error('DB must not be reached')}},process.argv[2],[process.argv[3]],async()=>{}).then(()=>process.exit(1),e=>process.exit(e.status===503?0:1));`;
  require('node:child_process').execFileSync(process.execPath,['-e',code,require.resolve('../src/lib/mediaFileTransaction'),dir,file]);
  let entered=false;
  await assert.rejects(mediaFileTransaction(fakeDb(),dir,[file],async()=>{entered=true;}),error=>error.status===503);
  assert.equal(entered,false);
  resume.resolve();await rejected;
 }finally{resume.resolve();fs.copyFile=copy;}
 await mediaFileTransaction(fakeDb(),dir,[file],async()=>{await fs.writeFile(file,'accepted next compression');});
 assert.equal(await fs.readFile(file,'utf8'),'accepted next compression');
 assert.deepEqual(await fs.readdir(path.join(dir,'.mutations')),[]);
});

test('backup creation failure does not leave a directory mutex behind',async t=>{
 const dir=await fixture(t),make=fs.mkdtemp;fs.mkdtemp=async()=>{throw Error('backup unavailable');};
 try{await assert.rejects(mediaFileTransaction(fakeDb(),dir,[],async()=>{}),/backup unavailable/);}
 finally{fs.mkdtemp=make;}
 assert.deepEqual(await fs.readdir(path.join(dir,'.mutations')),[]);
 await mediaFileTransaction(fakeDb(),dir,[],async()=>{});
});

test('SQL rollback failure retains mutex and recovery bytes instead of allowing another writer',async t=>{
 const dir=await fixture(t),file=path.join(dir,'image.webp');await fs.writeFile(file,'original');
 const db=fakeDb({rollback:async()=>{throw Error('connection lost');}});
 await assert.rejects(mediaFileTransaction(db,dir,[file],async(_c,journal)=>{journal.changed(file);await fs.writeFile(file,'uncertain');throw Error('metadata failed');}),error=>error.status===503&&/写入已暂停/.test(error.message));
 const entries=await fs.readdir(path.join(dir,'.mutations'));assert(entries.includes('lock'));
 assert.equal(await fs.readFile(path.join(dir,'.mutations',entries.find(name=>name.startsWith('mutation-')),'0'),'utf8'),'original');
 assert(db.events.includes('destroy'));
 await assert.rejects(mediaFileTransaction(fakeDb(),dir,[file],async()=>{throw Error('must not enter');}),error=>error.status===503);
});

test('filesystem recovery failure retains mutex and backup',async t=>{
 const dir=await fixture(t),file=path.join(dir,'image.webp');await fs.writeFile(file,'original');const copy=fs.copyFile;
 fs.copyFile=async(source,dest,...args)=>{if(dest===file)throw Error('disk recovery failed');return copy(source,dest,...args);};
 try{await assert.rejects(mediaFileTransaction(fakeDb(),dir,[file],async(_c,journal)=>{journal.changed(file);await fs.writeFile(file,'uncertain');throw Error('metadata failed');}),error=>error.status===503);}
 finally{fs.copyFile=copy;}
 const entries=await fs.readdir(path.join(dir,'.mutations'));assert(entries.includes('lock'));
 assert.equal(await fs.readFile(path.join(dir,'.mutations',entries.find(name=>name.startsWith('mutation-')),'0'),'utf8'),'original');
 await assert.rejects(mediaFileTransaction(fakeDb(),dir,[file],async()=>{}),error=>error.status===503);
});

function trashHarness(dir,{committed=false}={}){
 const state={status:'active',loseCommit:true};
 const db={getConnection:async()=>{let before,persisted=false;return {beginTransaction:async()=>{before=state.status;},query:async sql=>{if(sql.includes('UPDATE media_assets SET status="trashed"'))state.status='trashed';if(sql.includes('UPDATE media_assets SET status="active"'))state.status='active';return [[]];},
  commit:async()=>{persisted=committed||!state.loseCommit;if(state.loseCommit)throw Error('lost COMMIT response');},rollback:async()=>{if(!persisted)state.status=before;},release:()=>{}};}};
 const context={mediaFileTransaction,db,uploadDir:dir,filePathFor:name=>path.join(dir,name),trashPathFor:name=>path.join(dir,'.trash',name),
  findMedia:async(name,status)=>state.status===status?{filename:name,url:'/api/uploads/'+name}:null,mediaReferences:{countReferences:async()=>0},fs:require('node:fs')};
 const source=require('node:fs').readFileSync(path.join(__dirname,'../src/routes/upload.js'),'utf8');
 const snippet=source.slice(source.indexOf('async function moveMediaToTrash('),source.indexOf('async function permanentlyDeleteMedia('));
 require('node:vm').runInNewContext(snippet+'\nthis.move=moveMediaToTrash;this.restore=restoreMediaFromTrash;',context);
 return {...context,state};
}

for(const committed of [false,true])test(`ambiguous trash COMMIT ${committed?'committed':'rolled back'} can safely ${committed?'restore':'retry trash'} after refresh`,async t=>{
 const dir=await fixture(t);await fs.mkdir(path.join(dir,'.trash'));const file=path.join(dir,'image.webp'),trash=path.join(dir,'.trash/image.webp');await fs.writeFile(file,'original');
 const harness=trashHarness(dir,{committed});await assert.rejects(harness.move('image.webp'),error=>error.status===503);
 assert.equal(harness.state.status,committed?'trashed':'active');assert.equal(await fs.readFile(file,'utf8'),'original');assert.equal(await fs.readFile(trash,'utf8'),'original');
 harness.state.loseCommit=false;
 assert.equal((await (committed?harness.restore('image.webp'):harness.move('image.webp'))).ok,true);
 assert.equal(harness.state.status,committed?'active':'trashed');
 assert.equal(await fs.readFile(committed?file:trash,'utf8'),'original');await assert.rejects(fs.access(committed?trash:file));
});

test('same-byte unowned trash target is rejected without being restored or overwritten',async t=>{
 const dir=await fixture(t);await fs.mkdir(path.join(dir,'.trash'));const file=path.join(dir,'image.webp'),trash=path.join(dir,'.trash/image.webp');await fs.writeFile(file,'identical');await fs.writeFile(trash,'identical');
 const harness=trashHarness(dir);harness.state.loseCommit=false;const copy=fs.copyFile;let restoration=0;
 fs.copyFile=async(source,dest,...args)=>{if(dest===file||dest===trash)restoration++;return copy(source,dest,...args);};
 try{await assert.rejects(harness.move('image.webp'),error=>error.status===409);harness.state.status='trashed';await assert.rejects(harness.restore('image.webp'),error=>error.status===409);}
 finally{fs.copyFile=copy;}
 assert.equal(restoration,0);assert.equal(await fs.readFile(file,'utf8'),'identical');assert.equal(await fs.readFile(trash,'utf8'),'identical');
});

test('changed recovery alias bytes and a replaced inode are rejected',async t=>{
 for(const change of ['bytes','inode']){
  const dir=await fixture(t);await fs.mkdir(path.join(dir,'.trash'));const file=path.join(dir,'image.webp'),trash=path.join(dir,'.trash/image.webp');await fs.writeFile(file,'original');const harness=trashHarness(dir);
  await assert.rejects(harness.move('image.webp'),error=>error.status===503);harness.state.loseCommit=false;
  if(change==='bytes')await fs.writeFile(trash,'other bytes');
  else{const replacement=path.join(dir,'replacement');await fs.writeFile(replacement,'original');await fs.rename(replacement,trash);}
  await assert.rejects(harness.move('image.webp'),error=>error.status===409);
  assert.equal(await fs.readFile(file,'utf8'),'original');assert.equal(await fs.readFile(trash,'utf8'),change==='bytes'?'other bytes':'original');
 }
});

test('malformed and symlinked recovery records cannot authorize an existing alias',async t=>{
 for(const kind of ['malformed','symlink']){
  const dir=await fixture(t);await fs.mkdir(path.join(dir,'.trash'));const file=path.join(dir,'image.webp'),trash=path.join(dir,'.trash/image.webp');await fs.writeFile(file,'original');const harness=trashHarness(dir);
  await assert.rejects(harness.move('image.webp'),error=>error.status===503);harness.state.loseCommit=false;
  const backup=(await fs.readdir(path.join(dir,'.mutations'))).find(name=>name.startsWith('mutation-')),record=path.join(dir,'.mutations',backup,'recovery.json');
  if(kind==='malformed')await fs.writeFile(record,'not JSON');
  else if(process.platform==='win32'){
   // Windows file symlinks require a host privilege; Linux CI uses a real link.
   const stat=fs.lstat;t.mock.method(fs,'lstat',async(file,...args)=>file===record?{isFile:()=>false}:stat(file,...args));
  }else{const outside=path.join(dir,'record-copy.json');await fs.copyFile(record,outside);await fs.unlink(record);await fs.symlink(outside,record);}
  await assert.rejects(harness.move('image.webp'),error=>error.status===503&&/恢复记录无法校验/.test(error.message));
  assert.equal(await fs.readFile(file,'utf8'),'original');assert.equal(await fs.readFile(trash,'utf8'),'original');assert.equal(harness.state.status,'active');
 }
});

test('single and batch mutation routes forward coordination status and recovery messages',async()=>{
 const source=require('node:fs').readFileSync(path.join(__dirname,'../src/routes/upload.js'),'utf8'),handlers=new Map();
 const scope={router:{post:(url,...items)=>handlers.set('POST '+url,items.at(-1)),put:(url,...items)=>handlers.set('PUT '+url,items.at(-1)),delete:(url,...items)=>handlers.set('DELETE '+url,items.at(-1))},authRequired:()=>{},editorOrAdmin:()=>{},console:{error:()=>{}},
  normalizeFilenameList:()=>['fixture.webp'],safeBasename:value=>value,findMedia:async()=>({filename:'fixture.webp'}),moveMediaToTrash:async()=>{throw Object.assign(Error('媒体正在恢复'),{status:503});},restoreMediaFromTrash:async()=>{throw Object.assign(Error('目标归属未确认'),{status:409});},permanentlyDeleteMedia:async()=>{throw Object.assign(Error('媒体正在恢复'),{status:503});}};
 require('node:vm').runInNewContext(source.slice(source.indexOf("router.post('/media/batch/delete'"),source.indexOf("router.post('/media/:filename/recompress'")),scope);
 for(const [method,url,status] of [['POST','/media/batch/delete',503],['POST','/media/batch/restore',409],['POST','/media/batch/permanent',503],['DELETE','/media/:filename',503],['POST','/media/:filename/restore',409],['DELETE','/media/:filename/permanent',503]]){
  let actual,body;await handlers.get(method+' '+url)({body:{filenames:['fixture.webp']},params:{filename:'fixture.webp'},query:{}},{status(value){actual=value;return this;},json(value){body=value;}});
  assert.equal(actual,status,method+' '+url);assert.equal(body.message,status===503?'媒体正在恢复':'目标归属未确认');
 }
});

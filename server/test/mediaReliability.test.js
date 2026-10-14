const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {mediaFileTransaction}=require('../src/lib/mediaFileTransaction');
const {countReferences,remapPayload}=require('../src/lib/mediaReferences');
test('reference guard includes unpublished consumers and history; underscores stay literal',async()=>{
 const visited=[];
 const total=await countReferences({query:async(sql,args)=>{visited.push(sql.match(/FROM (\w+)/)[1]);assert(sql.includes('LOCATE('));assert(args.every(x=>x==='/api/uploads/used_image.png'));return [[{count:['projects','updates','article_drafts','article_revisions','article_workflows'].includes(visited.at(-1))?1:0}]];}},'/api/uploads/used_image.png');
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
function fakeDb({commit=async()=>{}}={}){
 const events=[];return {events,getConnection:async()=>({beginTransaction:async()=>events.push('begin'),query:async()=>{events.push('lock');return [[]]},commit:async()=>{events.push('commit');await commit()},rollback:async()=>events.push('rollback'),release:()=>events.push('release')})};
}
test('database failure after rename restores the original file and removes the new path',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'media-rollback-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const old=path.join(dir,'old.png'),next=path.join(dir,'new.png');await fs.writeFile(old,'original bytes');const db=fakeDb();
 await assert.rejects(mediaFileTransaction(db,dir,[old,next],async(_c,journal)=>{await fs.rename(old,next);journal.created(next);throw Error('DB write failed')}),/DB write failed/);
 assert.equal(await fs.readFile(old,'utf8'),'original bytes');await assert.rejects(fs.access(next));assert.deepEqual(await fs.readdir(path.join(dir,'.mutations')),[]);assert.deepEqual(db.events,['begin','lock','rollback','release']);
});
test('failed same-name compression restores full original bytes and removes temporary output',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'media-compression-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const file=path.join(dir,'image.webp'),tmp=file+'.tmp';await fs.writeFile(file,'full original bytes');
 await assert.rejects(mediaFileTransaction(fakeDb(),dir,[file,tmp],async(_c,journal)=>{await fs.writeFile(file,'compressed');await fs.writeFile(tmp,'partial');journal.created(tmp);throw Error('metadata failed')}),/metadata failed/);
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
test('upload callback forwards a metadata failure to Express without an unhandled rejection',async()=>{
 const source=require('node:fs').readFileSync(path.join(__dirname,'../src/routes/upload.js'),'utf8');
 const snippet=source.slice(source.indexOf("router.post('/image'"),source.indexOf('module.exports ='));
 let handler;const vm=require('node:vm'),error=Error('metadata unavailable');
 const scope={router:{post:(_path,...handlers)=>{handler=handlers.at(-1)}},authRequired:()=>{},contributor:()=>{},require:()=>()=>()=>{},upload:{single:()=> (_req,_res,callback)=>callback(null)},getDetectedImageInfo:async()=>({ok:true}),checkedUploadPath:()=>'/fixture',normalizeQuality:()=> 'original',compressImageIfNeeded:async()=>({quality:'original'}),getImageMeta:async()=>({}),upsertMediaRecord:async()=>{throw error},path,console};
 vm.runInNewContext(snippet,scope);
 const received=await new Promise(resolve=>handler({file:{filename:'fixture.png',originalname:'fixture.png'},body:{},user:{id:1}},{status(){return this},json(){}},resolve));
 assert.equal(received,error);
});

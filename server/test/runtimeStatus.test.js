const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { workerStatus, writeWorkerState, runtimeStatus } = require('../src/lib/runtimeStatus');
test('worker status expires and rejects future timestamps', () => {
 const now = Date.now(), row = { startedAt:new Date(now-60000).toISOString(), checkedAt:new Date(now-1000).toISOString() };
 assert.equal(workerStatus(row,now).state,'running');
 assert.equal(workerStatus(row,now+90000).state,'unknown');
 assert.equal(workerStatus(row,now-2000).state,'unknown');
 assert.equal(workerStatus({...row,stopped:true},now).state,'stopped');
 assert.equal(workerStatus(null,now).state,'unknown');
});
test('runtime sanitizes persisted metadata and handles missing migrations without inventing a version', async t => {
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mooncci-runtime-'));
 process.env.MOONCCI_RUNTIME_DIR=dir;
 t.after(async()=>{delete process.env.MOONCCI_RUNTIME_DIR;await fs.rm(dir,{recursive:true,force:true});});
 await writeWorkerState(new Date().toISOString());
 await fs.writeFile(path.join(dir,'deployment.json'),JSON.stringify({revision:'secret-url',result:'secret-key',completedAt:'bad',token:'secret'}));
 let info=await runtimeStatus({query:async()=>{throw Object.assign(Error(),{code:'ER_NO_SUCH_TABLE'});}});
 assert.equal(info.worker.state,'running');assert.equal(info.migrations,null);assert.equal(info.deployment.revision,null);assert.equal(info.deployment.result,'unknown');assert(!JSON.stringify(info).includes('secret'));
 await fs.writeFile(path.join(dir,'worker.json'),'broken');
 info=await runtimeStatus({query:async()=>[[{filename:'test.sql',executed_at:null}]]});
 assert.equal(info.worker.state,'unknown');assert.equal(info.migrations[0].filename,'test.sql');
 await assert.rejects(()=>runtimeStatus({query:async()=>{throw Object.assign(Error(),{code:'ECONNREFUSED'});}}),{code:'ECONNREFUSED'});
});

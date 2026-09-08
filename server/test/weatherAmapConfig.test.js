const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), vm = require('vm');
const script = fs.readFileSync(path.resolve(__dirname, '../../scripts/configure-weather-amap.cjs'), 'utf8');
test('configuration checks Key before mutation, replaces old values and preserves unrelated secrets without logging them', async () => {
  const original = 'PORT=3001\nDB_PASSWORD=keep-me\nAMAP_WEB_SERVICE_KEY=old-value\nexport MOONCCI_CITY_PROVIDER=nominatim\n';
  let output = '', checks = 0;
  const logs = [], fakeProcess = { env: { MOONCCI_NEW_AMAP_KEY: 'a'.repeat(32) } };
  const fakeFs = {
    readFileSync: () => original, copyFileSync: () => {}, chmodSync: () => {}, statSync: () => ({ uid: 1001, gid: 1001 }),
    writeFileSync: (_path, text, options) => { assert.equal(checks, 2); assert.equal(options.mode,0o600); output = text; },
    chownSync: () => {}, renameSync: () => {},
  };
  const amap = { requestAmap: async () => { checks++; return {districts:[{}]}; }, reverseAddress: () => ({name:'测试市',region:'测试省'}) };
  await vm.runInNewContext(script, { __dirname:'/bundle', require: name => name==='fs'?fakeFs:name==='path'?path:name.endsWith('db')?{end:async()=>{}}:name.endsWith('weatherProtectionRepository')?{createProtectionRepository:()=>({})}:name.endsWith('weatherBudget')?{createBudgetFetch:()=>()=>{}}:amap,
    process:fakeProcess, console:{log: text => logs.push(text),error:text=>logs.push(text)} });
  assert.equal(fakeProcess.exitCode, undefined);
  const parsed=require('dotenv').parse(output);
  assert.equal(parsed.MOONCCI_CITY_PROVIDER,'amap'); assert.equal(parsed.AMAP_WEB_SERVICE_KEY,'a'.repeat(32));
  assert.equal(parsed.DB_PASSWORD,'keep-me'); assert.equal(parsed.PORT,'3001');
  assert.equal((output.match(/AMAP_WEB_SERVICE_KEY=/g)||[]).length,1);
  assert.doesNotMatch(logs.join(' '), /aaaaaaaa|keep-me|old-value/);
});
test('invalid service Key never modifies server configuration', async () => {
  const fakeProcess = { env: { MOONCCI_NEW_AMAP_KEY:'a'.repeat(32) } };
  let touched=false;
  await vm.runInNewContext(script, {__dirname:'/bundle',require:name=>name==='fs'?{readFileSync:()=>{touched=true;}}:name==='path'?path:name.endsWith('db')?{end:async()=>{}}:name.endsWith('weatherProtectionRepository')?{createProtectionRepository:()=>({})}:name.endsWith('weatherBudget')?{createBudgetFetch:()=>()=>{}}:{requestAmap:async()=>{throw Object.assign(Error('Key无效'),{publicCode:'AMAP_10001'});}},
    process:fakeProcess,console:{log:()=>{},error:()=>{}}});
  assert.equal(touched,false);assert.equal(fakeProcess.exitCode,1);
});

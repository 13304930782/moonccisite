const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const React=require('react'),{act,create}=require('react-test-renderer');
const code=ts.transpileModule(fs.readFileSync('src/app/lib/useArticleDraft.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
class ApiError extends Error{constructor(status){super('failure');this.status=status;}}
async function fixture(){
 let hook,root,mode='normal',pending=[];const writes=[],notifications=[];
 let draft={id:'fixture',version:1,payload:{title:'Original',content:'Body',tags:[]},updated_at:new Date().toISOString()};
 const api=async(path,options={})=>{
  if(options.method==='DELETE'){if(typeof mode==='number')throw new ApiError(mode);if(mode==='uncertain'){const e=new ApiError(0);e.uncertain=true;throw e;}return {};}
  if(path.endsWith('/submit'))return {state:'submitted'};
  if(options.method==='PUT'){
   const value=JSON.parse(options.body);writes.push(value);
   if(typeof mode==='number')throw new ApiError(mode);
   if(mode==='offline')throw Error('offline');
   if(mode==='hold')await new Promise(resolve=>pending.push(resolve));
   draft={...draft,payload:value.payload,version:draft.version+1};return draft;
  }
  if(mode==='refresh-failed')throw Error('refresh failed');
  return draft;
 };
 const module={exports:{}};const requireMock=name=>name==='react'?React:name==='./api'?{api,ApiError}:name==='./feedback'?{notify:{success:x=>notifications.push(x),error:x=>notifications.push(x)}}:name==='./draftStorage'?{readBackup:async()=>null,writeBackup:async()=>{}}:{useUnsavedLeave:()=>{}};
 new Function('exports','require','location','history','sessionStorage',code)(module.exports,requireMock,{search:'?draft=fixture',href:'https://example.test/admin/write?draft=fixture',pathname:'/admin/write'},{replaceState(){}},{removeItem(){}});
 function Probe(){hook=module.exports.useArticleDraft(1);return null;}
 await act(async()=>{root=create(React.createElement(Probe));});
 return {get hook(){return hook;},writes,notifications,setMode:m=>mode=m,release:()=>pending.shift()(),close:()=>act(()=>root.unmount())};
}
test('manual saves serialize and only confirm the version accepted by the server',async()=>{
 const f=await fixture();f.setMode('hold');let first,second;
 await act(async()=>{f.hook.update({...f.hook.form,title:'First'});first=f.hook.save('manual');});
 assert.equal(f.hook.status,'正在保存');assert.equal(f.writes.length,1);
 await act(async()=>{f.hook.update({...f.hook.form,title:'Second'});second=f.hook.save('manual');});assert.equal(f.writes.length,1);
 await act(async()=>{f.release();await first;});assert.equal(f.writes.length,2);assert.equal(f.writes[1].version,2);assert.equal(f.writes[1].payload.title,'Second');
 await act(async()=>{f.release();await second;});assert.match(f.hook.status,/已保存到服务器/);assert.equal(f.hook.dirty,false);f.close();
});
test('offline, 401 and 409 retain current writing and do not claim server save',async()=>{
 for(const mode of ['offline',401,409]){const f=await fixture();f.setMode(mode);await act(async()=>{f.hook.update({...f.hook.form,title:'Keep me'});await f.hook.save('manual');});assert.equal(f.hook.form.title,'Keep me');assert.doesNotMatch(f.hook.status,/已保存到服务器/);assert.equal(f.hook.blocked,mode!== 'offline');f.close();}
});
test('accepted submission remains accepted and locked when follow-up refresh fails',async()=>{
 const f=await fixture();f.setMode('refresh-failed');let accepted;await act(async()=>{accepted=await f.hook.action('submit');});assert.equal(accepted,true);assert.equal(f.hook.draft.workflow.state,'submitted');assert.equal(f.hook.status,'已提交审核');assert(f.notifications.some(x=>x.includes('状态刷新失败')));f.close();
});


test('rejected discard keeps writing editable and manual saving available',async()=>{
 const f=await fixture();f.setMode(400);
 await act(async()=>{f.hook.update({...f.hook.form,title:'Keep writing'});await f.hook.discard();});
 assert.equal(f.hook.blocked,false);assert.equal(f.hook.busy,false);assert.equal(f.hook.form.title,'Keep writing');assert.equal(f.hook.dirty,true);
 f.setMode('normal');await act(async()=>{await f.hook.save('manual');});assert.equal(f.hook.dirty,false);f.close();
});

test('uncertain discard and permission/version failures still require reconciliation',async()=>{
 for(const mode of ['uncertain',401,403,409]){const f=await fixture();f.setMode(mode);await act(async()=>{f.hook.update({...f.hook.form,title:'Keep me'});await f.hook.discard();});assert.equal(f.hook.blocked,true);assert.equal(f.hook.form.title,'Keep me');f.close();}
});

test('explicit submission retries a failed save and submits the current accepted version',async()=>{
 const f=await fixture();f.setMode('offline');await act(async()=>{f.hook.update({...f.hook.form,title:'Retry me'});await f.hook.save('manual');});
 f.setMode('normal');let result;await act(async()=>{result=await f.hook.action('submit');});assert.equal(result,true);assert.equal(f.writes.at(-1).payload.title,'Retry me');assert.equal(f.hook.dirty,false);f.close();
});

const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express');
const Module=require('node:module');
for(const fail of [false,true])test('bookmark move waits for '+(fail?'failed':'successful')+' commit',async t=>{
 const original=Module._load;
 let finish,entered;
 const gate=new Promise(r=>finish=r),started=new Promise(r=>entered=r);
 const connection={query:async sql=>sql.includes('SELECT')?[[{id:1}]]:[{affectedRows:1}]};
 const service={enabled:()=>true,transaction:async fn=>{await fn(connection);entered();await gate;if(fail)throw Error('commit failed');}};
 const route=require.resolve('../src/routes/bookmarkFolders');delete require.cache[route];
 Module._load=function(name,parent,...rest){
  if(parent?.filename===route){
   if(name==='../db')return {};
   if(name==='../services/engagement')return service;
   if(name==='../middleware/auth')return {authRequired:(req,res,next)=>{req.user={id:1};next();}};
  }
  return original.call(this,name,parent,...rest);
 };
 let router;
 try{router=require(route);}finally{Module._load=original;delete require.cache[route];}
 const app=express();app.use(express.json());
 let responseSent=false;app.use((req,res,next)=>{res.on('finish',()=>responseSent=true);next();});app.use(router);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(async()=>{finish();server.closeAllConnections();await new Promise(r=>server.close(r));});
 const pending=fetch('http://127.0.0.1:'+server.address().port+'/move/1',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({folder_id:1})});
 await started;await new Promise(r=>setImmediate(r));
 assert.equal(responseSent,false,'success must not be sent before transaction commit');
 finish();const response=await pending;assert.equal(response.status,fail?500:200);
 const body=await response.json();if(fail)assert.equal(body.message,'操作失败，请重试。');else assert.deepEqual(body,{ok:true});
});

const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {createRouter}=require('../src/routes/nodeMonitor');
test('monitor enforces owner/allowlist, validates credentials, never returns secrets and revokes cached access',async t=>{
 let config={secret:'encrypted',allowedUserIds:[3]},calls=0;
 const db={query:async(sql,args)=>{
  if(sql.startsWith('SELECT setting_value'))return [[{setting_value:JSON.stringify(config)}]];
  if(sql.startsWith('INSERT'))return [{}];
  if(sql.startsWith('UPDATE site_settings')){config=JSON.parse(args[0]);return [{}];}
  return [[{id:3,username:'reader',role:'user',status:'active'}]];
 }};
 db.getConnection=async()=>({...db,beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{}});
 const auth={authRequired:(req,res,next)=>{const role=req.headers['x-test-role'];if(!role)return res.sendStatus(401);req.user={role,id:role==='owner'?1:role==='admin'?2:3};next();},ownerOnly:(req,res,next)=>req.user.role==='owner'?next():res.sendStatus(403)};
 const fetcher=async(url,options)=>{calls++;if(options.headers.Authorization==='Bearer invalid')return new Response('{}',{status:403});return Response.json({status:'success',data:url.endsWith('/api/nodes')?[{uuid:'11111111-1111-1111-1111-111111111111',name:'node',ipv4:'private',token:'hidden'}]:[{time:new Date().toISOString(),cpu:15,ram:1,ram_total:2,disk:1,disk_total:5,net_in:10,net_out:20}]});};
 const app=express();app.use(express.json());app.use(createRouter({db,auth,fetcher,secrets:{seal:()=> 'encrypted',open:()=> 'secret-key'}}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;
 const get=(path,role)=>fetch(base+path,{headers:role?{'x-test-role':role}:{}});
 assert.equal((await get('/snapshot')).status,401);
 assert.equal((await get('/snapshot','admin')).status,403);assert.equal(calls,0);
 assert.equal((await get('/settings','user')).status,403);
 const settings=await get('/settings','owner');assert.equal(settings.headers.get('cache-control'),'private, no-store');assert.doesNotMatch(await settings.text(),/encrypted|secret-key/);
 const good=await get('/snapshot','user');assert.equal(good.status,200);const data=await good.json();assert.equal(data.nodes[0].state,'online');assert.equal(data.nodes[0].cpu,15);assert.doesNotMatch(JSON.stringify(data),/ipv4|hidden|token|secret/);
 config.allowedUserIds=[];assert.equal((await get('/snapshot','user')).status,403);
 const put=(role,body)=>fetch(base+'/settings',{method:'PUT',headers:{'x-test-role':role,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await put('admin',{allowedUserIds:[2]})).status,403);
 assert.equal((await put('owner',{apiKey:'invalid'})).status,400);assert.deepEqual(config.allowedUserIds,[]);
 assert.equal((await put('owner',{apiKey:'replacement'})).status,200);assert.equal(config.secret,'encrypted');assert.deepEqual(config.allowedUserIds,[]);
 const permission=(role,allowed)=>fetch(base+'/users/3',{method:'PUT',headers:{'x-test-role':role,'Content-Type':'application/json'},body:JSON.stringify({allowed})});
 assert.equal((await permission('admin',true)).status,403);
 assert.equal((await permission('owner',true)).status,200);assert.equal((await get('/snapshot','user')).status,200);
 assert.equal((await permission('owner',false)).status,200);assert.equal((await get('/snapshot','user')).status,403);
});

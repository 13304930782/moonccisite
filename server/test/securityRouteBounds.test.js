const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
test('sensitive route limiters reject excess requests before the handler',async()=>{
 for(const [file,route,method] of [['engagement','/unsubscribe','post'],['loginSessions','/sessions','get'],['operations','/mail-failures','get'],['series','/','get'],['posts','/:id','delete'],['upload','/media','get']]){
  const exported=require('../src/routes/'+file),router=exported.router||exported;
  const layer=router.stack.find(x=>x.route?.path===route&&x.route.methods[method]);
  assert.ok(layer,file);
  const app=express();let reached=0;
  app.use(layer.route.stack[0].handle,(_req,res)=>{reached++;res.sendStatus(204);});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  try{
   for(let i=0;i<200;i++)assert.equal((await fetch('http://127.0.0.1:'+server.address().port)).status,204,file);
   const blocked=await fetch('http://127.0.0.1:'+server.address().port);
   assert.equal(blocked.status,429,file);assert.ok(blocked.headers.get('retry-after'));assert.equal(reached,200);
  }finally{await new Promise(r=>server.close(r));}
 }
});
test('unsubscribe confirmation validates query values and preserves the explicit confirmation step',async()=>{
 process.env.ENGAGEMENT_ENABLED='true';
 delete require.cache[require.resolve('../src/routes/engagement')];
 const app=express();app.use(require('../src/routes/engagement'));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{
  const base='http://127.0.0.1:'+server.address().port;
  for(const query of ['token=%22%3E%3Cscript%3E&kind=comment','token='+('a'.repeat(64))+'&kind=%22%3E%3Cscript%3E']){
   const r=await fetch(base+'/unsubscribe?'+query);assert.equal(r.status,400);assert.ok(!(await r.text()).includes('<script>'));
  }
  const valid=await fetch(base+'/unsubscribe?token='+('a'.repeat(64))+'&kind=comment');
  assert.equal(valid.status,200);const html=await valid.text();
  assert.match(html,/<form method="post">/);assert.match(html,/确认退订/);
 }finally{await new Promise(r=>server.close(r));delete process.env.ENGAGEMENT_ENABLED;}
});


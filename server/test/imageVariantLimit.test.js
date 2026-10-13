const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const express=require('express');
const rateLimit=require('express-rate-limit');

test('image variant request budget falls back to the original without blocking public image downloads',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/index.js'),'utf8');
 const start=source.indexOf('const imageVariantLimiter = rateLimit('),end=source.indexOf("app.get('/api/image-variants",start);
 assert.ok(start>=0&&end>start);
 const limiter=vm.runInNewContext(source.slice(start,end)+'\nimageVariantLimiter;', {rateLimit});
 const app=express();app.set('trust proxy','loopback');
 app.get('/api/image-variants/:width/:name',limiter,(_req,res)=>res.json({variant:true}));
 app.get('/api/uploads/:name',(_req,res)=>res.send('original'));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 try{
  for(let i=0;i<300;i++){
   const response=await fetch(origin+'/api/image-variants/180/cover.webp');
   assert.equal(response.status,200);await response.arrayBuffer();
  }
  const limited=await fetch(origin+'/api/image-variants/180/cover.webp',{redirect:'manual'});
  assert.equal(limited.status,302);assert.equal(limited.headers.get('location'),'/api/uploads/cover.webp');
  await limited.arrayBuffer();
  const original=await fetch(origin+'/api/uploads/cover.webp');
  assert.equal(original.status,200);assert.equal(await original.text(),'original');
  const invalid=await fetch(origin+'/api/image-variants/180/bad.html',{redirect:'manual'});
  assert.equal(invalid.status,404);await invalid.arrayBuffer();
 }finally{await new Promise(resolve=>server.close(resolve));}
});

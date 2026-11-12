const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),Module=require('node:module');
test('article likes are private to the viewer, idempotent and reversible',async t=>{
 const likes=new Set(),connection={beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){},query:async(sql,args)=>{
  if(sql.startsWith('SELECT status FROM users'))return [[{status:args[0]===3?'disabled':'active'}]];
  if(sql.startsWith('SELECT status FROM posts'))return [[...(args[0]===9?[{status:'published'}]:args[0]===8?[{status:'draft'}]:[])]];
  if(sql.startsWith('INSERT INTO article_likes')){likes.add(`${args[0]}:${args[1]}`);return [{}]}
  if(sql.startsWith('DELETE FROM article_likes')){likes.delete(`${args[0]}:${args[1]}`);return [{}]}
  if(sql.startsWith('SELECT COUNT(*)'))return [[{total:[...likes].filter(x=>x.endsWith(':'+args[1])).length,liked:likes.has(`${args[0]}:${args[1]}`)?1:0}]];
  throw Error(sql);
 }};
 const db={query:connection.query,getConnection:async()=>connection},route=require.resolve('../src/routes/articleLikes'),original=Module._load;
 delete require.cache[route];Module._load=function(name,parent,...rest){if(parent?.filename===route){if(name==='../db')return db;if(name==='../middleware/auth')return {authRequired:(req,res,next)=>{if(!req.headers['x-user'])return res.status(401).end();req.user={id:Number(req.headers['x-user'])};next()},getUserFromRequest:async req=>req.headers['x-user']?{id:Number(req.headers['x-user']),status:'active'}:null}}return original.call(this,name,parent,...rest)};
 let router;try{router=require(route)}finally{Module._load=original;delete require.cache[route]}
 const app=express();app.use('/likes',router);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const req=(method='GET',user='')=>fetch(`http://127.0.0.1:${server.address().port}/likes/9`,{method,headers:user?{'x-user':user}:{}});
 assert.equal((await req('PUT')).status,401);
 assert.equal((await req('PUT','3')).status,401);
 assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/likes/8`)).status,404);
 assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/likes/0`)).status,400);
 let r=await req('PUT','1');assert.deepEqual(await r.json(),{like_count:1,liked:true});
 r=await req('PUT','1');assert.deepEqual(await r.json(),{like_count:1,liked:true});
 r=await req('PUT','2');assert.deepEqual(await r.json(),{like_count:2,liked:true});
 r=await req('GET','1');assert.match(r.headers.get('cache-control'),/no-store/);assert.deepEqual(await r.json(),{like_count:2,liked:true});
 r=await req();assert.deepEqual(await r.json(),{like_count:2,liked:false});
 r=await req('DELETE','1');assert.deepEqual(await r.json(),{like_count:1,liked:false});
 r=await req('DELETE','1');assert.deepEqual(await r.json(),{like_count:1,liked:false});
});

const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {createContentTranslations}=require('../src/routes/contentTranslations');
test('same-record translation save/publish/withdraw preserves snapshot and enforces conflict and authorization',async t=>{
 let row=null;const db={query:async(sql,args)=>{
  if(sql.startsWith('SELECT name'))return [[{name:'原文',summary:'',content:'正文'}]];
  if(sql.startsWith('SELECT'))return [row?[{...row}]:[]];
  if(sql.startsWith('INSERT')){row={version:1,draft:args[3],published:null};return [{affectedRows:1}];}
  if(sql.includes('SET draft=')){row.draft=args[0];row.version++;}
  if(sql.includes('SET published=?'))row.published=args[0];
  if(sql.includes('SET published=NULL'))row.published=null;
  return [{affectedRows:1}];
 },getConnection:async()=>({...db,beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){}})};
 const app=express();app.use(express.json());app.use(createContentTranslations({db,readSettingsSource:async()=>({about:{name:'站长',headings:{story:'关于博客'},timeline:[{date:'2026',description:'上线'}]},links:[]}),authRequired:(req,res,next)=>req.headers.authorization?next():res.sendStatus(401),adminOnly:(req,res,next)=>req.headers.authorization==='admin'?next():res.sendStatus(403)}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const url=`http://127.0.0.1:${server.address().port}/project/2`;
 const put=body=>fetch(url,{method:'PUT',headers:{authorization:'admin','content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url,{headers:{authorization:'editor'}})).status,403);
 assert.equal((await put({draft:{},version:0,action:'publish'})).status,400);
 let response=await put({draft:{name:'English',content:'Translated body'},version:0});assert.equal(response.status,200);const saved=await response.json();assert.equal(saved.published,null);assert.equal(saved.source.name,'原文');
 assert.equal((await put({draft:{name:'English',content:'Translated body'},version:0})).status,409);
 response=await put({draft:{name:'English',content:'Translated body'},version:1,action:'publish'});assert.equal(response.status,200);assert.equal((await response.json()).published.content,'Translated body');
 response=await put({draft:{name:'Draft secret',content:'Draft body'},version:2});assert.equal((await response.json()).published.name,'English');
 response=await put({draft:{name:'Draft secret',content:'Draft body'},version:3,action:'withdraw'});assert.equal((await response.json()).published,null);
 assert.equal((await put({draft:{url:'https://evil.test'},version:4})).status,400);
 const partial=await fetch(url.replace('/project/2','/blog_pages/1'),{method:'PUT',headers:{authorization:'admin','content-type':'application/json'},body:JSON.stringify({draft:{about:{name:'Author'}},version:4,action:'publish'})});assert.equal(partial.status,400);assert.match((await partial.json()).message,/about.headings.story/);
 for(const type of ['constructor','toString','__proto__'])assert.equal((await fetch(url.replace('/project/','/'+type+'/'),{headers:{authorization:'admin'}})).status,400);
});

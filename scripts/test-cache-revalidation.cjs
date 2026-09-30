// Browser HTTP cache experiment; shortened fixture TTL, no production requests.
const http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const results=[];
 const server=http.createServer((req,res)=>{
  if(req.url==='/'){res.end('fixture');return;}
  const valid=req.headers['if-none-match']==='"fixture"';
  results.push({path:req.url,status:valid?304:200});
  res.setHeader('ETag','"fixture"');
  res.setHeader('Cache-Control',valid&&req.url==='/old.webp'?'private, no-store':'private, max-age=1, must-revalidate');
  res.setHeader('Vary','Cookie, Authorization, Proxy-Authorization, Range');
  res.statusCode=valid?304:200;res.end(valid?undefined:'image');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch(process.platform==='win32'?{channel:'msedge'}:{});
 try{
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);
  for(const path of ['/old.webp','/new.webp']){
   const fetchImage=()=>page.evaluate(async p=>{const r=await fetch(p);await r.arrayBuffer();},path);
   await fetchImage();await fetchImage();await page.waitForTimeout(2100);await fetchImage();await fetchImage();
   const statuses=results.filter(r=>r.path===path).map(r=>r.status);
   console.log(JSON.stringify({path,statuses}));
   if(path==='/new.webp')assert.deepEqual(statuses,[200,304]);
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});

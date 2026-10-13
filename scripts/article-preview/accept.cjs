const fs=require('node:fs'),path=require('node:path'),https=require('node:https');
const {pathToFileURL}=require('node:url');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function health(){
 for(let i=0;i<25;i++){
  try{const response=await fetch('http://127.0.0.1:3001/api/health',{signal:AbortSignal.timeout(1500)});if(response.ok&&(await response.json()).ok===true)return;}catch{}
  await pause(1000);
 }
 throw Error('API health unavailable after restart');
}
function request(url){return new Promise((resolve,reject)=>{
 const req=https.get({hostname:'mooncci.site',servername:'mooncci.site',family:4,port:443,path:url,
  lookup:(_host,options,callback)=>options.all?callback(null,[{address:'127.0.0.1',family:4}]):callback(null,'127.0.0.1',4)},response=>{
   const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('error',reject);
   response.on('end',()=>response.statusCode===200?resolve(Buffer.concat(chunks)):reject(Error('HTTP status '+response.statusCode)));
  });req.setTimeout(20000,()=>req.destroy(Error('HTTPS timeout')));req.on('error',reject);
});}
async function main(){
 const [mode,root,live]=process.argv.slice(2);
 if(mode==='health'){await health();console.log('PASS: restored API health');return;}
 if(mode==='stage'){
  const renderer=await import(pathToFileURL(path.join(root,'document.mjs')).href);
  const {loadPublicResource}=require(path.join(live,'src/lib/publicDocument.js'));
  const cache=new Map();
  const load=resource=>{if(!cache.has(resource))cache.set(resource,loadPublicResource(resource));return cache.get(resource);};
  for(const url of ['/article/17','/articles','/']){
   const result=await renderer.renderDocument(url,load);
   if(!result.html.includes(url==='/article/17'?'hero-heading':'blog-card'))throw Error('Staged SSR failed: '+url);
  }
  console.log('PASS: staged renderer, real read-only public data and lazy Markdown dependencies');
  return;
 }
 if(mode!=='public')throw Error('Unexpected acceptance mode');
 await health();
 const entry=fs.readFileSync(path.join(root,'dist/index.html'),'utf8');
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'MANIFEST.json'),'utf8'));
 const refs=html=>[...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map(match=>match[1]);
 const js=refs(entry).filter(ref=>ref.endsWith('.js'));
 if(!js.length)throw Error('Missing new entry script');
 for(const url of ['/article/17','/articles','/']){
  const html=(await request(url)).toString();
  if(!html.includes('mooncci-document-data')||!js.every(src=>html.includes(src)))throw Error('New SSR/frontend did not reach public page: '+url);
  const assets=new Set(refs(html));
  if(url==='/'){
   const css=fs.readFileSync(path.join(root,'server/runtime/home.css'),'utf8');
   const inline=html.match(/<style id="mooncci-home-css">([\s\S]*?)<\/style>/)?.[1];
   if(inline!==css)throw Error('Homepage SSR CSS differs');
  }
  for(const asset of assets){
   const data=await request(asset);
   const expected=fs.readFileSync(path.join(root,'dist',asset));
   if(!data.equals(expected))throw Error('Public asset differs: '+asset);
  }
 }
 console.log('PASS: public SSR, matching new resources, health; revision='+manifest.revision);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});

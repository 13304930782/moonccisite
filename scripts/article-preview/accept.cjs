const fs=require('node:fs'),path=require('node:path'),https=require('node:https');
const {pathToFileURL}=require('node:url');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function validateDocument(url,result){
 const data=result?.data,html=result?.html||'';
 const classes=[...html.matchAll(/\bclass=(["'])(.*?)\1/g)].flatMap(match=>match[2].split(/\s+/));
 const has=name=>classes.includes(name);
 const fail=reason=>{throw Error('SSR acceptance failed: '+url+'; '+reason);};
 if(data?.status!==200)fail('document status='+data?.status);
 if(Object.keys(data.errors||{}).length)fail('resource errors='+JSON.stringify(data.errors));
 const article=url.match(/^\/article\/(\d+)$/);
 if(article){
  const post=data.resources?.['/posts/'+article[1]];
  if(!post||post.status!=='published'||Number(post.id)!==Number(article[1]))fail('published article data missing');
  if(!has('article-presentation')||!has('detail-title')||!has('detail-body'))fail('article body/title missing');
  if(!has('hero-band')&&!has('hero-heading'))fail('article header missing');
 }else if(url==='/'){
  if(!has('home-main')||!has('home-hero'))fail('homepage content missing');
 }else if(url==='/articles'&&!has('blog-card'))fail('article cards missing');
}
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
  const load=resource=>{
   if(!cache.has(resource))cache.set(resource,loadPublicResource(resource).catch(error=>{
    throw Error('Staged public resource failed: '+resource+'; HTTP='+(error.status||'unknown')+'; '+error.message,{cause:error});
   }));
   return cache.get(resource);
  };
  for(const url of ['/article/17','/articles','/']){
   const result=await renderer.renderDocument(url,load);
   validateDocument(url,result);
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
  const bootstrap=html.match(/<script id="mooncci-document-data" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  if(!bootstrap)throw Error('Public SSR bootstrap missing: '+url);
  validateDocument(url,{html,data:JSON.parse(bootstrap)});
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
module.exports={validateDocument};
if(require.main===module)main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});

// Only release-owned atomic-copy leftovers are touched; preflight requires them absent.
const fs=require('node:fs');
const {target}=require('./verify-bilingual-release.cjs');
function tempFiles(manifest,remove=false,live,web){
 for(const name of Object.keys(manifest.files)){
  const file=target(name,live,web)+'.bilingual-new';
  let stat;try{stat=fs.lstatSync(file);}catch(e){if(e.code==='ENOENT')continue;throw e;}
  if(stat.isSymbolicLink()||!stat.isFile())throw Error('Unsafe release temporary file: '+name);
  if(!remove)throw Error('Stale release temporary file: '+name);
  fs.unlinkSync(file);
 }
}
module.exports={tempFiles};
if(require.main===module){
 const [mode,file]=process.argv.slice(2);
 if(!['check','remove'].includes(mode)||!file)throw Error('Expected check or remove and manifest path');
 tempFiles(JSON.parse(fs.readFileSync(file,'utf8')),mode==='remove');
}

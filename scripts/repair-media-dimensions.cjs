// Explicitly scoped repair of the two observed stale records; never rewrites images.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const targets=[
 'import-c75fb0e91471-bfafc384e05b5c98e6e9.webp',
 'import-c75fb0e91471-afe92a9c8e9e0e02575f.webp',
];
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
async function repair({db,sharp,uploads,backups,apply=false,rollback}) {
 const c=await db.getConnection();const changes=[];let backupFile;
 try {
  await c.beginTransaction();
  let requested=targets.map(filename=>({filename}));
  if(rollback){
   const resolved=path.resolve(rollback);
   if(path.dirname(resolved)!==path.resolve(backups)||!/^mooncci-media-dimensions\.[a-zA-Z0-9-]+\.json$/.test(path.basename(resolved)))throw Error('Invalid backup location');
   requested=JSON.parse(fs.readFileSync(resolved,'utf8')).changes;
   if(!Array.isArray(requested)||requested.length>2||new Set(requested.map(x=>x.filename)).size!==requested.length||requested.some(x=>!targets.includes(x.filename)))throw Error('Invalid backup scope');
  }
  for(const entry of requested){
   const [[row]]=await c.query("SELECT width,height FROM media_assets WHERE filename=? AND status='active' FOR UPDATE",[entry.filename]);
   if(!row)throw Error('Active media record missing: '+entry.filename);
   const bytes=await fs.promises.readFile(path.join(uploads,entry.filename)),sha256=digest(bytes),actual=await sharp(bytes).metadata();
   const before={width:row.width,height:row.height};
   let after={width:actual.width,height:actual.height};
   if(rollback){
    if(sha256!==entry.sha256||row.width!==entry.after.width||row.height!==entry.after.height)throw Error('Image or metadata changed after repair: '+entry.filename);
    after=entry.before;
   }
   if(!Number.isInteger(after.width)||after.width<=0||!Number.isInteger(after.height)||after.height<=0)throw Error('Invalid dimensions');
   if(before.width!==after.width||before.height!==after.height)changes.push({filename:entry.filename,before,after,sha256});
  }
  if((apply||rollback)&&changes.length){
   fs.mkdirSync(backups,{recursive:true});backupFile=path.join(backups,'mooncci-media-dimensions.'+crypto.randomUUID()+'.json');
   fs.writeFileSync(backupFile,JSON.stringify({changes},null,2)+'\n',{mode:0o600,flag:'wx'});
   for(const change of changes){
    if(digest(await fs.promises.readFile(path.join(uploads,change.filename)))!==change.sha256)throw Error('Image changed while checking');
    await c.query('UPDATE media_assets SET width=?,height=? WHERE filename=?',[change.after.width,change.after.height,change.filename]);
   }
  }
  await c.commit();return {mode:rollback?'rollback':apply?'apply':'check',changes,backupFile};
 }catch(e){await c.rollback();throw e;}finally{c.release();}
}
module.exports={repair};
if(require.main===module){
 const live='/www/wwwroot/mooncci-source/server',req=require('node:module').createRequire(path.join(live,'package.json'));
 req('dotenv').config({path:path.join(live,'.env')});const db=req('./src/db');
 const args=process.argv.slice(2);if(args.length&&!(args.length===1&&args[0]==='--apply')&&!(args.length===2&&args[0]==='--rollback')){console.error('Usage: node repair-media-dimensions.cjs [--apply | --rollback BACKUP]');process.exitCode=1;db.end();}
 else repair({db,sharp:req('sharp'),uploads:path.join(live,'uploads'),backups:'/www/backup',apply:args[0]==='--apply',rollback:args[0]==='--rollback'?args[1]:undefined}).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.end());
}

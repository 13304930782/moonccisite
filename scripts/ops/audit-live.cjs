// Read-only production inventory. No credentials, content or account data are printed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(process.argv[2]||'/www/wwwroot/mooncci-source/server');
const files=['src/lib/articleRevisions.js','src/routes/bookmarks.js','src/lib/dependencyHealth.js','src/lib/proxyTransport.js','src/lib/runtimeStatus.js','src/worker.js'];
const result={checkedAt:new Date().toISOString(),node:process.version,files:{},migrations:null};
for(const file of files){try{result.files[file]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n')).digest('hex');}catch{result.files[file]=null;}}
(async()=>{
 const createRequire=require('node:module').createRequire;const local=createRequire(path.join(root,'package.json'));
 local('dotenv').config({path:path.join(root,'.env'),quiet:true});
 const db=local('./src/db');
 try{const [rows]=await db.query('SELECT filename FROM schema_migrations ORDER BY filename');result.migrations=rows.map(x=>x.filename);}
 catch{result.migrationRead='unavailable';}finally{await db.end();}
 console.log(JSON.stringify(result,null,2));
})().catch(()=>{console.log(JSON.stringify(result,null,2));process.exitCode=1;});

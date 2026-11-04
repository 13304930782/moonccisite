// Release-scoped file verification and backup; never log database credentials.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const LIVE = '/www/wwwroot/mooncci-source/server', WEB = '/www/wwwroot/mooncci.site';
const OPS = {'ops/nginx-blog-seo.conf':'/www/server/panel/vhost/nginx/mooncci-blog-seo.inc','ops/refresh-sitemap.py':'/opt/mooncci-sitemap/refresh-sitemap.py','ops/indexnow.py':'/opt/mooncci-indexnow/indexnow.py'};
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', {mode:0o600});
function safe(root, name) {
  if (!/^[A-Za-z0-9_@+.,/-]+$/.test(name) || name.split('/').some(p => ['', '.', '..'].includes(p))) throw Error('Unsafe path');
  let current = root;
  for (const part of name.split('/')) {
    current = path.join(current, part);
    try { if (fs.lstatSync(current).isSymbolicLink()) throw Error('Symlink path'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return current;
}
function target(name, live=LIVE, web=WEB, ops=OPS) {
  if(Object.hasOwn(OPS,name)){
    const absolute=path.resolve(ops[name]);
    for(let parent=path.dirname(absolute);;parent=path.dirname(parent)){
      try{if(fs.lstatSync(parent).isSymbolicLink())throw Error('Symlink operations path');}catch(e){if(e.code!=='ENOENT')throw e;}
      if(parent===path.dirname(parent))break;
    }
    return safe(path.dirname(absolute),path.basename(absolute));
  }
  if (name.startsWith('dist/')) return safe(web, name.slice(5));
  if (/^server\/(src\/|runtime\/|database\/migrations\/|scripts\/migrate-bilingual\.js$)/.test(name) && !name.includes('/node_modules/') && !name.endsWith('deployment.json')) return safe(live, name.slice(7));
  throw Error('Protected destination');
}
function digest(file) { return fs.existsSync(file) ? sha(fs.readFileSync(file)) : null; }
function verify(folder, live=LIVE, web=WEB, installed=false, ops=OPS) {
  const manifest=json(path.join(folder,'MANIFEST.json')), baseline=json(path.join(folder,'BASELINE.json'));
  if (manifest.version!==1 || baseline.version!==1 || JSON.stringify(Object.keys(manifest.files).sort())!==JSON.stringify(Object.keys(baseline.files).sort())) throw Error('Invalid manifest scope');
  const age=Date.now()-Date.parse(baseline.captured_at);
  if (!installed && (!Number.isFinite(age)||age<0||age>86400000)) throw Error('Stale baseline');
  for (const [name,hash] of Object.entries(manifest.files)) {
    if (digest(safe(folder,name))!==hash) throw Error('Payload mismatch: '+name);
    if (digest(target(name,live,web,ops))!==(installed?hash:baseline.files[name])) throw Error('Production drift: '+name);
  }
  if (Object.keys(baseline.prerequisites).sort().join(',')!=='package-lock.json,package.json') throw Error('Prerequisite scope');
  for(const [name,hash] of Object.entries(baseline.prerequisites)) if(digest(safe(live,name))!==hash) throw Error('Dependency drift');
  return manifest;
}
function snapshot(folder, backup, live=LIVE, web=WEB,ops=OPS) {
  const manifest=verify(folder,live,web,false,ops); const before={};
  for(const name of Object.keys(manifest.files)) {
    const source=target(name,live,web,ops); before[name]=digest(source);
    if(before[name]!==null){const dest=safe(backup+'/before',name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(source,dest);fs.chmodSync(dest,fs.statSync(source).mode&0o777);if(digest(dest)!==before[name])throw Error('Backup mismatch');}
  }
  write(path.join(backup,'BEFORE.json'),before);
  for(const file of ['MANIFEST.json','BASELINE.json','verify-bilingual-release.cjs','rollback-bilingual.sh'])fs.copyFileSync(path.join(folder,file),path.join(backup,file));
}
function publicDirectory(directory,owner) {
  try {const stat=fs.lstatSync(directory);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Unsafe destination directory');return;}
  catch(e){if(e.code!=='ENOENT')throw e;}
  publicDirectory(path.dirname(directory),owner);
  fs.mkdirSync(directory,{mode:0o755});
  // Explicit chmod defeats deployment umask 077; existing directories are untouched.
  fs.chmodSync(directory,0o755);
  if(owner)fs.chownSync(directory,owner.uid,owner.gid);
}
function copy(source,destination,owner,mode=0o644) {
  publicDirectory(path.dirname(destination),owner);const temp=destination+'.bilingual-new';
  fs.copyFileSync(source,temp,fs.constants.COPYFILE_EXCL);fs.chmodSync(temp,mode);
  if(owner)fs.chownSync(temp,owner.uid,owner.gid);fs.renameSync(temp,destination);
}
function install(folder) {
  const manifest=verify(folder);const owner=fs.statSync(LIVE);
  // Static assets precede the document entry; old hashed assets remain available.
  const order=name=>name==='dist/index.html'?4:name==='ops/indexnow.py'?3:name==='ops/refresh-sitemap.py'?2:1;
  const names=Object.keys(manifest.files).sort((a,b)=>order(a)-order(b));
  for(const name of names){const dest=target(name);copy(safe(folder,name),dest,name.startsWith('server/')?owner:null,Object.hasOwn(OPS,name)?fs.statSync(dest).mode&0o777:0o644);}
  verify(folder,LIVE,WEB,true);
}
function restore(backup, presentationOnly, live=LIVE,web=WEB,ops=OPS) {
  if(presentationOnly)throw Error('Bilingual backend already started: keep compatible frontend, SSR and ops; manual reviewed recovery required');
  const before=json(path.join(backup,'BEFORE.json')),owner=fs.statSync(live);
  const entries=Object.entries(before).filter(([name])=>!name.startsWith('server/database/migrations/'));
  for(const [name,hash] of entries)if(hash!==null&&digest(safe(backup+'/before',name))!==hash)throw Error('Corrupt rollback backup');
  for(const [name,hash] of entries){const dest=target(name,live,web,ops);if(hash!==null)copy(safe(backup+'/before',name),dest,name.startsWith('server/')?owner:null,Object.hasOwn(OPS,name)?fs.statSync(safe(backup+'/before',name)).mode&0o777:0o644);else if(fs.existsSync(dest))fs.unlinkSync(dest);}
}
function database() {
  const env=require(path.join(LIVE,'node_modules/dotenv')).parse(fs.readFileSync(path.join(LIVE,'.env')));
  if(!env.DB_USER||!env.DB_NAME||!/^[A-Za-z0-9_]+$/.test(env.DB_NAME))throw Error('Database configuration unavailable');
  const mysql=require(path.join(LIVE,'node_modules/mysql2/promise'));
  return {env,connection:mysql.createConnection({host:env.DB_HOST||'127.0.0.1',port:Number(env.DB_PORT||3306),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME})};
}
const PRESERVED_TABLES=['posts','users','comments','article_bookmarks','article_drafts','article_revisions','subscribers'];
async function counts(connection) {
  const result={};for(const table of PRESERVED_TABLES){const [[row]]=await connection.query('SELECT COUNT(*) AS total FROM `'+table+'`');result[table]=String(row.total);}return result;
}
function inspectDump(bytes,tables,expectedCounts) {
  const sql=bytes.toString('utf8');
  if(!Buffer.from(sql,'utf8').equals(bytes)||!sql.trimEnd().match(/-- Dump completed on [^\r\n]+$/)||tables.some(t=>!sql.includes('CREATE TABLE `'+t+'`')))throw Error('Incomplete database backup');
  for(const [table,count]of Object.entries(expectedCounts)){
    const actual=sql.split('\n').filter(line=>line.startsWith('INSERT INTO `'+table+'` VALUES ')).length;
    if(String(actual)!==count)throw Error('Database dump row count differs: '+table);
  }
}
async function verifyDatabase(backup) {
  const {connection:pending}=database(),connection=await pending;
  try {const actual=await counts(connection),before=json(path.join(backup,'database-backup.json')).counts;for(const table of PRESERVED_TABLES)if(actual[table]!==before[table])throw Error('Migration changed original row count: '+table);write(path.join(backup,'database-after.json'),{counts:actual});}
  finally {await connection.end();}
}
async function backupDatabase(backup) {
  const {env,connection:pending}=database(),connection=await pending;
  let tables,beforeCounts;
  try {const [rows]=await connection.query('SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE=\'BASE TABLE\'',[env.DB_NAME]);if(!rows.length||rows.some(r=>r.ENGINE!=='InnoDB'))throw Error('Nontransactional database backup needs review');tables=rows.map(r=>r.TABLE_NAME);beforeCounts=await counts(connection);}
  finally {await connection.end();}
  const executable=['/www/server/mysql/bin/mysqldump','/usr/bin/mysqldump','/usr/bin/mariadb-dump'].find(p=>fs.existsSync(p));if(!executable)throw Error('mysqldump missing');
  const config=path.join(backup,'.mysql-defaults');const quote=v=>'"'+String(v).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n').replace(/\r/g,'\\r')+'"';
  const settings={host:env.DB_HOST||'127.0.0.1',port:env.DB_PORT||3306,user:env.DB_USER,password:env.DB_PASSWORD||''};
  fs.writeFileSync(config,'[client]\n'+Object.entries(settings).map(([k,v])=>k+'='+quote(v)+'\n').join(''),{flag:'wx',mode:0o600});
  let fd;
  try {
    const help=spawnSync(executable,['--no-defaults','--help'],{encoding:'utf8',maxBuffer:4e6});if(help.status!==0)throw Error('mysqldump inspection failed');
    const args=['--defaults-file='+config,'--single-transaction','--quick','--hex-blob','--skip-extended-insert','--skip-add-locks','--skip-lock-tables','--default-character-set=utf8mb4'];
    if(help.stdout.includes('set-gtid-purged'))args.push('--set-gtid-purged=OFF');if(help.stdout.includes('no-tablespaces'))args.push('--no-tablespaces');args.push(env.DB_NAME);
    const file=path.join(backup,'database-before.sql');fd=fs.openSync(file,'wx',0o600);const result=spawnSync(executable,args,{stdio:['ignore',fd,'ignore'],timeout:600000});fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
    if(result.status!==0||result.error)throw Error('Database backup failed');
    const bytes=fs.readFileSync(file);inspectDump(bytes,tables,beforeCounts);
    fs.writeFileSync(file+'.sha256',sha(bytes)+'  database-before.sql\n',{mode:0o600});write(path.join(backup,'database-backup.json'),{tables,counts:beforeCounts,bytes:bytes.length,sha256:sha(bytes)});
  } finally {if(fd!==undefined)fs.closeSync(fd);fs.unlinkSync(config);}
}
module.exports={safe,target,verify,snapshot,restore,copy,inspectDump};
if(require.main===module)(async()=>{
  const [mode,folder,backup]=process.argv.slice(2);
  if(mode==='verify')verify(folder);
  else if(mode==='snapshot')snapshot(folder,backup);
  else if(mode==='backup-db')await backupDatabase(folder);
  else if(mode==='verify-db')await verifyDatabase(folder);
  else if(mode==='install')install(folder);
  else if(mode==='restore')restore(folder,fs.existsSync(path.join(folder,'BACKEND_STARTED'))||fs.existsSync(path.join(folder,'SUCCESS')));
  else throw Error('Unknown release command');
  console.log('PASS: '+mode);
})().catch(e=>{console.error(e.message);process.exitCode=1;});

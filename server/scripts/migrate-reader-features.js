// Apply exactly one additive migration from this offline package.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
async function main(){
 const live=path.resolve(process.argv[2]||'');const stage=process.argv[3];
 const files={revisions:'202609190001_article_revisions.sql',bookmarks:'202609190002_article_bookmarks.sql'};
 if(!Object.hasOwn(files,stage))throw Error('Unknown release stage');
 require(path.join(live,'node_modules/dotenv')).config({path:path.join(live,'.env')});
 const mysql=require(path.join(live,'node_modules/mysql2/promise'));
 const c=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,multipleStatements:true});
 const filename=files[stage],sql=fs.readFileSync(path.join(__dirname,'../database/migrations',filename),'utf8').replace(/\r\n/g,'\n').trim(),checksum=crypto.createHash('sha256').update(sql).digest('hex');
 try{
  const [[lock]]=await c.query("SELECT GET_LOCK('mooncci_schema_migrations',30) AS locked");if(Number(lock.locked)!==1)throw Error('Migration lock unavailable');
  await c.query('SELECT version,published_at,updated_at FROM posts LIMIT 0');
  await c.query('SELECT id,base_version,payload FROM article_drafts LIMIT 0');
  if(stage==='bookmarks')await c.query('SELECT id FROM article_revisions LIMIT 0');
  const [[row]]=await c.query('SELECT checksum FROM schema_migrations WHERE filename=?',[filename]);
  if(row&&row.checksum!==checksum)throw Error('Migration checksum mismatch');
  if(!row){await c.query(sql);await c.query('INSERT INTO schema_migrations(filename,checksum) VALUES (?,?)',[filename,checksum]);}
  await c.query(stage==='revisions'?'SELECT id,post_id,draft_id,kind,payload,content_hash,published_version,auto_bucket FROM article_revisions LIMIT 0':'SELECT id,user_id,post_id,created_at FROM article_bookmarks LIMIT 0');
  console.log('Additive migration verified: '+filename);
 }finally{await c.query("SELECT RELEASE_LOCK('mooncci_schema_migrations')");await c.end();}
}
main().catch(e=>{console.error('[reader-migrate]',e.code||e.message);process.exitCode=1;});

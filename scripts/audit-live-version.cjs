// Read-only: run from the deployed server directory. Never prints configuration or user data.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
async function main() {
  const root = process.cwd(), files = {};
  function walk(directory) {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, {withFileTypes:true})) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(file);
      else if (/\.(js|json|sql)$/.test(entry.name)) files[path.relative(root,file).replaceAll('\\','/')] = crypto.createHash('sha256').update(fs.readFileSync(file).toString('utf8').replaceAll('\r\n','\n')).digest('hex');
    }
  }
  for (const directory of ['src','database/migrations']) walk(path.join(root,directory));
  for (const name of ['package.json','package-lock.json','database/schema.sql']) if(fs.existsSync(name)) files[name]=crypto.createHash('sha256').update(fs.readFileSync(name).toString('utf8').replaceAll('\r\n','\n')).digest('hex');
  const result = {capturedAt:new Date().toISOString(),node:process.version,files,frontend:{},migrations:null};
  for (const name of ['deployed-source.txt','deployed-commit.txt']) {
    const file=path.join('/www/wwwroot/mooncci.site',name);
    if(fs.existsSync(file)) result.frontend[name]=fs.readFileSync(file,'utf8').trim();
  }
  if(process.argv.includes('--migrations')) {
    const {createRequire}=require('node:module'), req=createRequire(path.join(root,'package.json'));
    req('dotenv').config({path:path.join(root,'.env'),quiet:true});
    const db=req('./src/db.js');
    try { const [rows]=await db.query('SELECT filename,checksum FROM schema_migrations ORDER BY filename');result.migrations=rows; }
    finally {await db.end();}
  }
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
main().catch(()=>{console.error('Read-only version audit failed; verify the server directory and database connectivity.');process.exitCode=1;});

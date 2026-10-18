// Only this release's additive migrations; interrupted DDL is validated before resuming.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const files = ['202610180001_newsletter_review.sql', '202610180002_article_summary_mode.sql'];
const shapes = {
  newsletter_runs: [['week_start','date','NO'],['status',"enum('running','completed','skipped','attention')",'NO'],['reason','varchar(80)','NO'],['item_count','int','NO'],['first_checked_at','datetime','NO'],['last_checked_at','datetime','NO'],['started_at','datetime','YES']],
  newsletter_exclusions: [['week_start','date','NO'],['content_type',"enum('post','update','release')",'NO'],['content_id','int','NO']],
};
function assertShape(rows, expected) {
  if (rows.length !== expected.length || expected.some(([name,type,nullable],i) => rows[i].Field !== name || rows[i].Type.toLowerCase().replace(/int\(\d+\)/g,'int') !== type || rows[i].Null !== nullable)) throw Error('Unexpected migration schema');
}
async function apply(connection, directory) {
  const [[lock]] = await connection.query("SELECT GET_LOCK('mooncci_schema_migrations',30) AS locked");
  if (Number(lock.locked) !== 1) throw Error('Migration lock unavailable');
  try {
    const [ledger] = await connection.query('SELECT filename,checksum FROM schema_migrations');
    for (const filename of files) {
      const sql = fs.readFileSync(path.join(directory,filename),'utf8').replace(/\r\n/g,'\n').trim();
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      const previous = ledger.find(row => row.filename === filename);
      if (previous && previous.checksum !== checksum) throw Error('Migration checksum mismatch');
      if (filename === files[0]) {
        for (const [table,expected] of Object.entries(shapes)) {
          const [present] = await connection.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[table]);
          if (!present.length) {
            if (previous) throw Error('Recorded migration table missing');
            const statement = sql.split(';').find(part => part.includes('CREATE TABLE IF NOT EXISTS '+table));
            await connection.query(statement);
          }
          const [columns] = await connection.query('SHOW COLUMNS FROM '+table);
          assertShape(columns,expected);
          const [[storage]] = await connection.query('SELECT ENGINE,TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[table]);
          if (storage.ENGINE !== 'InnoDB' || !storage.TABLE_COLLATION.startsWith('utf8mb4_')) throw Error('Unexpected migration storage');
          const [keys] = await connection.query('SHOW INDEX FROM '+table+" WHERE Key_name='PRIMARY'");
          const wanted = table === 'newsletter_runs' ? ['week_start'] : ['week_start','content_type','content_id'];
          if (JSON.stringify(keys.sort((a,b)=>a.Seq_in_index-b.Seq_in_index).map(row=>row.Column_name)) !== JSON.stringify(wanted)) throw Error('Unexpected migration primary key');
        }
      } else {
        let [columns] = await connection.query("SHOW COLUMNS FROM posts LIKE 'summary_mode'");
        if (!columns.length) {
          if (previous) throw Error('Recorded summary column missing');
          await connection.query(sql);
          [columns] = await connection.query("SHOW COLUMNS FROM posts LIKE 'summary_mode'");
        }
        assertShape(columns,[['summary_mode',"enum('','manual','ai')",'NO']]);
        if (columns[0].Default !== '') throw Error('Unexpected summary default');
      }
      if (!previous) await connection.query('INSERT INTO schema_migrations(filename,checksum) VALUES (?,?)',[filename,checksum]);
    }
  } finally { await connection.query("SELECT RELEASE_LOCK('mooncci_schema_migrations')"); }
}
async function main() {
  const live = path.resolve(process.argv[2] || '');
  if (!process.argv[2]) throw Error('Explicit live backend path required');
  const env = require(path.join(live,'node_modules/dotenv')).parse(fs.readFileSync(path.join(live,'.env')));
  if (!env.DB_NAME || !env.DB_USER) throw Error('Database configuration incomplete');
  const mysql = require(path.join(live,'node_modules/mysql2/promise'));
  const connection = await mysql.createConnection({host:env.DB_HOST||'127.0.0.1',port:Number(env.DB_PORT||3306),user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME,charset:'utf8mb4'});
  try { await apply(connection,path.join(__dirname,'../database/migrations')); console.log('Verified newsletter and summary migrations; historical migrations untouched.'); }
  finally { await connection.end(); }
}
if (require.main === module) main().catch(()=>{console.error('Scoped migration failed; inspect schema and ledger before retrying.');process.exitCode=1;});
module.exports = {apply,assertShape,files,shapes};

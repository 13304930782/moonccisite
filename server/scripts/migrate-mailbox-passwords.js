// Additive, checksum-tracked migration. Uses only the live backend's installed dependencies and .env.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

async function main() {
  const live = path.resolve(process.argv[2] || '');
  if (!fs.existsSync(path.join(live, '.env'))) throw Error('Live backend .env is missing');
  require(path.join(live, 'node_modules/dotenv')).config({ path: path.join(live, '.env') });
  const mysql = require(path.join(live, 'node_modules/mysql2/promise'));
  const filename = '202610040001_mailbox_password_changes.sql';
  const sql = fs.readFileSync(path.join(__dirname, '../database/migrations', filename), 'utf8').replace(/\r\n/g, '\n').trim();
  const checksum = crypto.createHash('sha256').update(sql).digest('hex');
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, charset: 'utf8mb4',
  });
  let locked = false;
  try {
    const [[lock]] = await connection.query("SELECT GET_LOCK('mooncci_schema_migrations',30) AS locked");
    if (Number(lock.locked) !== 1) throw Error('Migration lock unavailable');
    locked = true;
    await connection.query('SELECT user_id,mailbox_address,smtp_secret,status FROM mailbox_access LIMIT 0');
    await connection.query('SELECT user_id,session_hash,purpose,old_code_hash FROM account_challenges LIMIT 0');
    const [rows] = await connection.query('SELECT checksum FROM schema_migrations WHERE filename=?', [filename]);
    if (rows[0] && rows[0].checksum !== checksum) throw Error('Migration checksum mismatch');
    if (!rows.length) {
      await connection.query(sql);
      await connection.query('INSERT INTO schema_migrations(filename,checksum) VALUES (?,?)', [filename, checksum]);
    }
    await connection.query('SELECT user_id,request_id,mailbox_address,new_secret,status,claimed_at FROM mailbox_password_changes LIMIT 0');
    console.log('[mailbox-password-migrate] password change table verified; old mailboxes untouched');
  } finally {
    if (locked) await connection.query("SELECT RELEASE_LOCK('mooncci_schema_migrations')");
    await connection.end();
  }
}
main().catch(() => { console.error('[mailbox-password-migrate] migration failed; inspect preflight before retrying'); process.exitCode = 1; });

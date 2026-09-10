// Scoped additive deployment: use installed dependencies/env, apply ONLY the bundled new migration.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
async function run() {
  const live = path.resolve(process.argv[2] || '');
  if (!fs.existsSync(path.join(live, '.env'))) throw new Error('Backend .env not found');
  require(path.join(live, 'node_modules/dotenv')).config({ path: path.join(live, '.env') });
  const mysql = require(path.join(live, 'node_modules/mysql2/promise'));
  const connection = await mysql.createConnection({ host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, charset: 'utf8mb4', multipleStatements: true });
  const filename = '202609100002_account_settings.sql';
  const sql = fs.readFileSync(path.join(__dirname, '../database/migrations', filename), 'utf8').replace(/\r\n/g, '\n').trim();
  const checksum = crypto.createHash('sha256').update(sql).digest('hex');
  try {
    const [[lock]] = await connection.query("SELECT GET_LOCK('mooncci_schema_migrations',30) AS locked");
    if (Number(lock.locked) !== 1) throw new Error('Migration lock unavailable');
    await connection.query('SELECT google_sub,login_attempts,locked_until FROM users LIMIT 0');
    await connection.query('SELECT token_hash,expires_at FROM auth_revocations LIMIT 0');
    await connection.query('SELECT user_id,invalid_before FROM auth_invalidations LIMIT 0');
    await connection.query('SELECT provider,client_id,subject,user_id FROM oauth_identities LIMIT 0');
    await connection.query('SELECT state_hash,return_to,user_id FROM oauth_states LIMIT 0');
    const [rows] = await connection.query('SELECT checksum FROM schema_migrations WHERE filename=?', [filename]);
    if (rows[0] && rows[0].checksum !== checksum) throw new Error('Account migration checksum mismatch; stopped without editing history');
    if (!rows.length) {
      await connection.query(sql);
      await connection.query('INSERT INTO schema_migrations(filename,checksum) VALUES (?,?)', [filename, checksum]);
    }
    for (const [table, columns] of Object.entries({ account_profiles: 'user_id,avatar_url,deleted_at,version', account_challenges: 'id,user_id,session_hash,purpose,old_email,new_email,old_code_hash,new_code_hash,attempts,created_at,expires_at' })) {
      await connection.query(`SELECT ${columns} FROM ${table} LIMIT 0`);
    }
    console.log('[account-migrate] new tables verified; historical migrations untouched');
  } finally { await connection.query("SELECT RELEASE_LOCK('mooncci_schema_migrations')"); await connection.end(); }
}
run().catch(() => { console.error('[account-migrate] migration/preflight failed; inspect database prerequisites before retrying'); process.exitCode = 1; });

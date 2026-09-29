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
  const filename = '202609240001_github_prereleases.sql';
  const sql = fs.readFileSync(path.join(__dirname, '../database/migrations', filename), 'utf8').replace(/\r\n/g, '\n').trim();
  const checksum = crypto.createHash('sha256').update(sql).digest('hex');
  try {
    const [[lock]] = await connection.query("SELECT GET_LOCK('mooncci_schema_migrations',30) AS locked");
    if (Number(lock.locked) !== 1) throw new Error('Migration lock unavailable');
    const [rows] = await connection.query('SELECT checksum FROM schema_migrations WHERE filename=?', [filename]);
    if (rows[0] && rows[0].checksum !== checksum) throw new Error('GitHub release migration checksum mismatch; stopped without editing history');
    if (!rows.length) {
      await connection.query(sql);
      await connection.query('INSERT INTO schema_migrations(filename,checksum) VALUES (?,?)', [filename, checksum]);
    }
    await connection.query('SELECT prerelease FROM project_releases LIMIT 0');
    await connection.query('SELECT release_policy_version FROM github_sync_state LIMIT 0');
    console.log('[github-release-migrate] additive columns verified; historical migrations untouched');
  } finally { await connection.query("SELECT RELEASE_LOCK('mooncci_schema_migrations')"); await connection.end(); }
}
run().catch(() => { console.error('[github-release-migrate] migration/preflight failed; inspect database prerequisites before retrying'); process.exitCode = 1; });

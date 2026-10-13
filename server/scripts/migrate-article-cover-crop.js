// Apply only the additive cover metadata migration using the live server's
// installed dependencies and environment. Never run historical migrations.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

async function run() {
  if (!process.argv[2]) throw new Error('Explicit backend directory required');
  const live = path.resolve(process.argv[2]);
  if (!fs.existsSync(path.join(live, '.env'))) throw new Error('Backend .env not found');
  // Bind this one migration to the same live file used by backup/verification.
  // Inherited DB_* shell variables must never redirect an offline deployment.
  const env = require(path.join(live, 'node_modules/dotenv')).parse(fs.readFileSync(path.join(live, '.env')));
  if (!env.DB_NAME || !env.DB_USER) throw new Error('Live database configuration incomplete');
  const mysql = require(path.join(live, 'node_modules/mysql2/promise'));
  const filename = '202610130001_article_cover_crop.sql';
  const sql = fs.readFileSync(path.join(__dirname, '../database/migrations', filename), 'utf8').replace(/\r\n/g, '\n').trim();
  const checksum = crypto.createHash('sha256').update(sql).digest('hex');
  const connection = await mysql.createConnection({
    host: env.DB_HOST || '127.0.0.1', port: Number(env.DB_PORT || 3306),
    user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME,
    charset: 'utf8mb4',
  });
  let locked = false;
  try {
    const [[lock]] = await connection.query("SELECT GET_LOCK('mooncci_schema_migrations',30) AS locked");
    locked = Number(lock.locked) === 1;
    if (!locked) throw new Error('Migration lock unavailable');
    await connection.query('SELECT id,cover_image,version FROM posts LIMIT 0');
    await connection.query('SELECT id,payload FROM article_drafts LIMIT 0');
    await connection.query('SELECT id,payload,content_hash FROM article_revisions LIMIT 0');
    const [rows] = await connection.query('SELECT checksum FROM schema_migrations WHERE filename=?', [filename]);
    if (rows[0] && rows[0].checksum !== checksum) throw new Error('Cover migration checksum mismatch');
    const [columns] = await connection.query("SHOW COLUMNS FROM posts LIKE 'cover_crop'");
    if (columns.length && (columns[0].Type.toLowerCase() !== 'json' || columns[0].Null !== 'YES'))
      throw new Error('Unexpected cover_crop column');
    if (rows.length && !columns.length) throw new Error('Recorded cover migration column missing');
    if (!rows.length) {
      // DDL is not transactional in MySQL. Safely resume if the column was added
      // before an interrupted ledger write, or is present in a fresh schema.
      if (!columns.length) await connection.query(sql);
      await connection.query('SELECT cover_crop FROM posts LIMIT 0');
      await connection.query('INSERT INTO schema_migrations(filename,checksum) VALUES (?,?)', [filename, checksum]);
    }
    await connection.query('SELECT id,cover_image,cover_crop FROM posts LIMIT 0');
    console.log('[cover-crop-migrate] nullable post metadata verified; historical migrations untouched');
  } finally {
    try { if (locked) await connection.query("SELECT RELEASE_LOCK('mooncci_schema_migrations')"); }
    finally { await connection.end(); }
  }
}

run().catch(() => {
  console.error('[cover-crop-migrate] migration/preflight failed; inspect schema and migration checksum before retrying');
  process.exitCode = 1;
});

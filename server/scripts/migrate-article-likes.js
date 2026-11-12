// Apply only the article likes migration; never replay historical migrations.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const filename = '202611120001_article_likes.sql';
const lockName = 'mooncci_schema_migrations';

function migrationSpec() {
  const sql = fs.readFileSync(path.join(__dirname, '../database/migrations', filename), 'utf8').replace(/\r\n/g, '\n').trim();
  return { filename, sql, checksum: crypto.createHash('sha256').update(sql).digest('hex') };
}

async function assertTable(connection) {
  const [tables] = await connection.query("SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='article_likes'");
  if (tables.length !== 1 || tables[0].ENGINE !== 'InnoDB') throw new Error('Unexpected article_likes engine');
  const [columns] = await connection.query('SHOW COLUMNS FROM article_likes');
  const expected = { user_id: /^int(?:\(11\))?$/i, post_id: /^int(?:\(11\))?$/i, created_at: /^datetime\(3\)$/i };
  if (columns.length !== 3 || columns.some(c => !Object.hasOwn(expected, c.Field) || !expected[c.Field].test(c.Type) || c.Null !== 'NO'))
    throw new Error('Unexpected article_likes columns');
  const [indexes] = await connection.query('SHOW INDEX FROM article_likes');
  const primary = indexes.filter(i => i.Key_name === 'PRIMARY').sort((a, b) => a.Seq_in_index - b.Seq_in_index);
  if (primary.length !== 2 || primary[0].Column_name !== 'user_id' || primary[1].Column_name !== 'post_id' || !indexes.some(i => i.Key_name === 'ix_article_likes_post' && i.Column_name === 'post_id' && i.Seq_in_index === 1))
    throw new Error('Unexpected article_likes indexes');
  const [keys] = await connection.query("SELECT k.COLUMN_NAME,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,r.DELETE_RULE FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME='article_likes' AND k.REFERENCED_TABLE_NAME IS NOT NULL");
  if (keys.length !== 2 || !['user_id:users', 'post_id:posts'].every(pair => keys.some(k => `${k.COLUMN_NAME}:${k.REFERENCED_TABLE_NAME}` === pair && k.REFERENCED_COLUMN_NAME === 'id' && k.DELETE_RULE === 'CASCADE')))
    throw new Error('Unexpected article_likes foreign keys');
}

async function migrate(connection, mode) {
  if (!['check', 'apply', 'verify'].includes(mode)) throw new Error('Invalid migration mode');
  const spec = migrationSpec();
  let locked = false;
  try {
    const [[lock]] = await connection.query('SELECT GET_LOCK(?,30) AS locked', [lockName]);
    locked = Number(lock.locked) === 1;
    if (!locked) throw new Error('Migration lock unavailable');
    await connection.query('SELECT id FROM users LIMIT 0');
    await connection.query('SELECT id FROM posts LIMIT 0');
    const [rows] = await connection.query('SELECT checksum FROM schema_migrations WHERE filename=?', [filename]);
    if (rows.length > 1 || (rows[0] && rows[0].checksum !== spec.checksum)) throw new Error('Migration checksum mismatch');
    const [tables] = await connection.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='article_likes'");
    if (tables.length) await assertTable(connection);
    if (rows.length && !tables.length) throw new Error('Recorded article_likes table missing');
    const previous = rows.length ? 'complete' : tables.length ? 'recoverable' : 'pending';
    if (mode === 'verify' && previous !== 'complete') throw new Error('Migration not complete');
    if (mode === 'apply' && !rows.length) {
      if (!tables.length) await connection.query(spec.sql);
      await assertTable(connection);
      await connection.query('INSERT INTO schema_migrations(filename,checksum) VALUES (?,?)', [filename, spec.checksum]);
    }
    return { migration: filename, checksum: spec.checksum, mode, previous, state: mode === 'apply' ? 'complete' : previous };
  } finally { if (locked) await connection.query('SELECT RELEASE_LOCK(?)', [lockName]); }
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 2 || !path.isAbsolute(argv[0]) || !/^--(?:check|apply|verify)$/.test(argv[1])) throw new Error('Explicit backend path and mode required');
  const live = fs.realpathSync(argv[0]);
  const env = require(path.join(live, 'node_modules/dotenv')).parse(fs.readFileSync(path.join(live, '.env')));
  const port = Number(env.DB_PORT || 3306);
  if (!env.DB_NAME || !env.DB_USER || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Database configuration incomplete');
  const mysql = require(path.join(live, 'node_modules/mysql2/promise'));
  const connection = await mysql.createConnection({ host: env.DB_HOST || '127.0.0.1', port, user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME, charset: 'utf8mb4' });
  try { return await migrate(connection, argv[1].slice(2)); } finally { await connection.end(); }
}

module.exports = { migrationSpec, assertTable, migrate, main };
if (require.main === module) main().then(result => console.log(JSON.stringify(result))).catch(() => {
  console.error('[article-likes-migrate] preflight/migration failed; inspect schema and checksum before retrying');
  process.exitCode = 1;
});

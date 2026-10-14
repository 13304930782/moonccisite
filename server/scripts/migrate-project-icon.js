// One offline migration, bound exclusively to the specified live backend .env.
// Existing values and historical SQL are never rewritten or replayed.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const filename = '202610150001_project_icon_image.sql';
const expectedSql = 'ALTER TABLE projects ADD COLUMN icon_image VARCHAR(500) NULL DEFAULT NULL AFTER cover_image;';
const lockName = 'mooncci_schema_migrations';

function migrationSpec() {
  const sql = fs.readFileSync(path.join(__dirname, '../database/migrations', filename), 'utf8').replace(/\r\n/g, '\n').trim();
  if (sql !== expectedSql) throw new Error('Unexpected project icon migration SQL');
  return { filename, sql, checksum: crypto.createHash('sha256').update(sql).digest('hex') };
}

function assertColumn(columns) {
  if (columns.length !== 1 || columns[0].Field !== 'icon_image' ||
      String(columns[0].Type).toLowerCase() !== 'varchar(500)' ||
      columns[0].Null !== 'YES' || columns[0].Default !== null ||
      columns[0].Extra !== '') throw new Error('Unexpected project icon column shape');
}

async function migrate(connection, mode) {
  if (!['check', 'apply', 'verify'].includes(mode)) throw new Error('Invalid project icon migration mode');
  const spec = migrationSpec();
  let locked = false;
  try {
    const [[lock]] = await connection.query('SELECT GET_LOCK(?,30) AS locked', [lockName]);
    locked = Number(lock.locked) === 1;
    if (!locked) throw new Error('Project icon migration lock unavailable');
    await connection.query('SELECT id,cover_image FROM projects LIMIT 0');
    await connection.query('SELECT filename,checksum FROM schema_migrations LIMIT 0');
    const [rows] = await connection.query('SELECT checksum FROM schema_migrations WHERE filename=?', [spec.filename]);
    if (rows.length > 1 || (rows[0] && rows[0].checksum !== spec.checksum))
      throw new Error('Project icon migration checksum mismatch');
    let [columns] = await connection.query("SHOW COLUMNS FROM projects LIKE 'icon_image'");
    if (columns.length) assertColumn(columns);
    if (rows.length && !columns.length) throw new Error('Recorded project icon column missing');
    const previous = rows.length ? 'complete' : columns.length ? 'recoverable' : 'pending';
    if (mode === 'verify' && previous !== 'complete') throw new Error('Project icon migration not complete');
    if (mode === 'apply' && !rows.length) {
      // DDL commits independently. A retry verifies the shape before recording
      // an already-added column, recovering a crash between DDL and ledger write.
      if (!columns.length) await connection.query(spec.sql);
      [columns] = await connection.query("SHOW COLUMNS FROM projects LIKE 'icon_image'");
      assertColumn(columns);
      await connection.query('INSERT INTO schema_migrations(filename,checksum) VALUES (?,?)', [spec.filename, spec.checksum]);
    }
    if (columns.length) await connection.query('SELECT icon_image FROM projects LIMIT 0');
    return { migration: spec.filename, checksum: spec.checksum, mode, previous,
      state: mode === 'apply' ? 'complete' : previous, historicalMigrations: 'untouched' };
  } finally {
    if (locked) await connection.query('SELECT RELEASE_LOCK(?)', [lockName]);
  }
}

function liveDependencies(livePath) {
  if (!livePath || !path.isAbsolute(livePath)) throw new Error('Explicit absolute live backend directory required');
  const live = fs.realpathSync(livePath);
  const envFile = path.join(live, '.env');
  if (!fs.statSync(envFile).isFile()) throw new Error('Live backend env file missing');
  const env = require(path.join(live, 'node_modules/dotenv')).parse(fs.readFileSync(envFile));
  const port = Number(env.DB_PORT || 3306);
  if (!env.DB_NAME || !env.DB_USER || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Live database configuration incomplete');
  return { mysql: require(path.join(live, 'node_modules/mysql2/promise')),
    options: { host: env.DB_HOST || '127.0.0.1', port, user: env.DB_USER,
      password: env.DB_PASSWORD, database: env.DB_NAME, charset: 'utf8mb4' } };
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 2 || !/^--(?:check|apply|verify)$/.test(argv[1]))
    throw new Error('Use migrate-project-icon.js /absolute/live/server --check|--apply|--verify');
  const { mysql, options } = liveDependencies(argv[0]);
  const connection = await mysql.createConnection(options);
  try { return await migrate(connection, argv[1].slice(2)); }
  finally { await connection.end(); }
}

module.exports = { migrationSpec, assertColumn, migrate, liveDependencies, main };
if (require.main === module) main().then(result => console.log(JSON.stringify(result))).catch(() => {
  console.error('[project-icon-migrate] preflight/migration failed; inspect column shape and this migration checksum before retrying');
  process.exitCode = 1;
});

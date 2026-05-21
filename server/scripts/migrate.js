const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

require('dotenv').config({
  path: path.resolve(__dirname, '../.env'),
});

const mysql = require('mysql2/promise');

const MIGRATIONS_DIR = path.resolve(__dirname, '../database/migrations');
const LOCK_NAME = 'mooncci_schema_migrations';

function usage() {
  console.log(`
Usage:
  node scripts/migrate.js
  node scripts/migrate.js --dry-run

Rules:
  - Put SQL files in server/database/migrations
  - File names should look like 202605210001_add_media_assets.sql
  - Already applied files are recorded in schema_migrations and skipped
`);
}

function getArgs() {
  const args = new Set(process.argv.slice(2));

  if (args.has('--help') || args.has('-h')) {
    usage();
    process.exit(0);
  }

  return {
    dryRun: args.has('--dry-run'),
  };
}

function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((filename) => filename.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
}

function checksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function createConnection() {
  return mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
    multipleStatements: true,
  });
}

async function ensureMigrationTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT NOT NULL AUTO_INCREMENT,
      filename VARCHAR(255) NOT NULL,
      checksum CHAR(64) NOT NULL,
      executed_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_schema_migrations_filename (filename)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

async function getAppliedMigrations(connection) {
  const [rows] = await connection.query(
    'SELECT filename, checksum FROM schema_migrations ORDER BY filename ASC'
  );

  return new Map(rows.map((row) => [row.filename, row.checksum]));
}

async function acquireLock(connection) {
  const [rows] = await connection.query('SELECT GET_LOCK(?, 30) AS locked', [LOCK_NAME]);

  if (!rows[0] || rows[0].locked !== 1) {
    throw new Error('Could not acquire migration lock. Another migration may be running.');
  }
}

async function releaseLock(connection) {
  try {
    await connection.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
  } catch (err) {
    console.error('[migrate] failed to release lock:', err.message);
  }
}

async function run() {
  const { dryRun } = getArgs();
  const files = getMigrationFiles();

  if (!files.length) {
    console.log('[migrate] no migration files found.');
    return;
  }

  const connection = await createConnection();

  try {
    await acquireLock(connection);
    await ensureMigrationTable(connection);

    const applied = await getAppliedMigrations(connection);
    const pending = [];

    for (const filename of files) {
      const filePath = path.join(MIGRATIONS_DIR, filename);
      const sql = fs.readFileSync(filePath, 'utf8').trim();
      const hash = checksum(sql);

      if (!sql) {
        console.log(`[migrate] skip empty file: ${filename}`);
        continue;
      }

      if (applied.has(filename)) {
        const oldHash = applied.get(filename);

        if (oldHash !== hash) {
          throw new Error(
            `Migration was changed after being applied: ${filename}. ` +
              'Create a new migration instead of editing old migrations.'
          );
        }

        console.log(`[migrate] already applied: ${filename}`);
        continue;
      }

      pending.push({ filename, sql, hash });
    }

    if (!pending.length) {
      console.log('[migrate] database is up to date.');
      return;
    }

    console.log(`[migrate] pending migrations: ${pending.length}`);
    pending.forEach((item) => console.log(`  - ${item.filename}`));

    if (dryRun) {
      console.log('[migrate] dry run only, no SQL executed.');
      return;
    }

    for (const item of pending) {
      const startedAt = Date.now();

      console.log(`[migrate] applying: ${item.filename}`);
      await connection.query(item.sql);
      await connection.query(
        'INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)',
        [item.filename, item.hash]
      );

      console.log(`[migrate] applied: ${item.filename} (${Date.now() - startedAt}ms)`);
    }

    console.log('[migrate] done.');
  } finally {
    await releaseLock(connection);
    await connection.end();
  }
}

run().catch((err) => {
  console.error('[migrate] failed:', err.message);
  process.exit(1);
});

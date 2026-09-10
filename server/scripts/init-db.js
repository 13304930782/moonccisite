// Fresh installations only. Existing installations must use migrate.js.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mysql = require('mysql2/promise');
const baseline = [
  '202605210001_create_schema_migrations_note.sql',
  '202605210002_create_media_assets.sql',
  '202607190001_add_google_identity.sql',
  '202607220001_create_early_access_applications.sql',
  '202609010001_create_electricity_monitor.sql',
  '202609020001_add_electricity_email_slot.sql',
  '202609050001_create_content_platform.sql',
  '202609050002_create_electricity_reports.sql',
  '202609070001_create_electricity_daily_usage.sql',
  '202609080001_create_companion_interactions.sql',
  '202609090001_electricity_rooms.sql',
  '202609090002_auth_revocation.sql',
  '202609090003_update_comments.sql',
  '202609110001_article_drafts.sql',
];
async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
    charset: 'utf8mb4',
  });
  let locked = false;
  try {
    const [[row]] = await connection.query(
      "SELECT GET_LOCK('mooncci_schema_migrations',10) acquired",
    );
    locked = Boolean(row.acquired);
    if (!locked) throw Error('Another schema operation is running');
    const [[count]] = await connection.query(
      'SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=DATABASE()',
    );
    if (Number(count.n) !== 0)
      throw Error(
        'Refusing to initialize a non-empty database. Use scripts/migrate.js for upgrades.',
      );
    const files = baseline.map((name) => ({
      name,
      content: fs.readFileSync(path.resolve(__dirname, '../database/migrations', name), 'utf8'),
    }));
    if (process.argv.includes('--dry-run')) {
      console.log(
        `[init-db] Empty database verified; schema snapshot and ${baseline.length} baseline checksums would be installed.`,
      );
      return;
    }
    await connection.query(
      fs.readFileSync(path.resolve(__dirname, '../database/schema.sql'), 'utf8'),
    );
    await connection.query(
      'CREATE TABLE schema_migrations (id INT AUTO_INCREMENT PRIMARY KEY,filename VARCHAR(255) NOT NULL UNIQUE,checksum CHAR(64) NOT NULL,executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    );
    for (const file of files)
      await connection.query('INSERT INTO schema_migrations (filename,checksum) VALUES (?,?)', [
        file.name,
        crypto.createHash('sha256').update(file.content.trim()).digest('hex'),
      ]);
    console.log(
      '[init-db] Current schema initialized with migration baseline. No users or articles were created.',
    );
  } finally {
    if (locked) await connection.query("SELECT RELEASE_LOCK('mooncci_schema_migrations')");
    await connection.end();
  }
}
main().catch((error) => {
  console.error('[init-db]', error.message);
  process.exitCode = 1;
});

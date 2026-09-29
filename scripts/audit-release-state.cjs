// Read-only release audit. Outputs file hashes and schema metadata, never rows or credentials.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const queries = {
  columns: 'SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION',
  indexes: 'SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, SUB_PART FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX',
  foreignKeys: 'SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME, COLUMN_NAME',
};
async function main() {
  const args = process.argv.slice(2);
  function option(name, fallback) { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; }
  const server = path.resolve(option('--server-root', process.cwd()));
  const web = path.resolve(option('--web-root', '/www/wwwroot/mooncci.site'));
  const manifest = JSON.parse(fs.readFileSync(option('--manifest', path.join(__dirname, 'mooncci-frontend-audit.json')), 'utf8'));
  const result = { capturedAt: new Date().toISOString(), release: manifest.release, frontend: { checked: 0, matched: 0, issues: [] }, schema: {} };
  for (const [name, expected] of Object.entries(manifest.files)) {
    const file = path.resolve(web, name);
    if (!file.startsWith(web + path.sep)) throw Error('Invalid manifest path');
    result.frontend.checked++;
    try {
      const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      if (actual === expected) result.frontend.matched++;
      else result.frontend.issues.push({ file: name, status: 'different', actual });
    } catch { result.frontend.issues.push({ file: name, status: 'unreadable-or-missing' }); }
  }
  const req = createRequire(path.join(server, 'package.json'));
  const envFile = path.join(server, '.env');
  const config = fs.existsSync(envFile) ? req('dotenv').parse(fs.readFileSync(envFile)) : {};
  const env = { ...config, ...process.env };
  const db = await req('mysql2/promise').createConnection({
    host: env.DB_HOST || '127.0.0.1', port: Number(option('--db-port', env.DB_PORT || 3306)),
    user: env.DB_USER, password: env.DB_PASSWORD,
    database: option('--db-name', env.DB_NAME), connectTimeout: 10000,
  });
  try {
    for (const [name, sql] of Object.entries(queries)) result.schema[name] = (await db.query(sql))[0];
  } finally { await db.end(); }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
main().catch(() => { console.error('Audit failed. Check server directory, manifest and database connection; no changes were made.'); process.exitCode = 1; });


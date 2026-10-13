// Recoverable schema + data snapshot. Credentials never enter argv, logs or the package.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const TABLES = ['posts', 'article_drafts', 'article_revisions', 'article_workflows', 'schema_migrations'];
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const LFJSON = value => JSON.stringify(value, null, 2) + '\n';

function singleRow(statement) {
  // mysqldump escapes strings; punctuation inside a quoted value is data.
  let depth = 0, quote = null;
  if (!statement.startsWith('(')) return false;
  for (let i = 0; i < statement.length; i++) {
    const char = statement[i];
    if (quote) {
      if (char === '\\') { i++; continue; }
      if (char === quote) {
        if (statement[i + 1] === quote) i++;
        else quote = null;
      }
    } else if (char === "'" || char === '"') quote = char;
    else if (char === '(') depth++;
    else if (char === ')' && --depth === 0) return statement.slice(i + 1).trim() === ';';
  }
  return false;
}

function inspectDump(file) {
  const bytes = fs.readFileSync(file);
  const sql = bytes.toString('utf8');
  if (!Buffer.from(sql, 'utf8').equals(bytes)) throw Error('Dump is not complete UTF-8 SQL');
  if (!bytes.length || !sql.trimEnd().match(/-- Dump completed on [^\r\n]+$/))
    throw Error('Incomplete MySQL dump completion marker');
  if (/^(?:USE |CREATE DATABASE )/m.test(sql)) throw Error('Dump must restore into a separately chosen database');
  const counts = {};
  for (const table of TABLES) {
    if (!sql.includes('CREATE TABLE `' + table + '`') || !sql.includes('-- Dumping data for table `' + table + '`'))
      throw Error('Missing dump schema/data section: ' + table);
    const inserts = sql.match(new RegExp('^INSERT INTO `' + table + '` VALUES [^\\r\\n]*$', 'gm')) || [];
    const anyInserts = sql.match(new RegExp('^INSERT INTO `' + table + '` ', 'gm')) || [];
    if (inserts.length !== anyInserts.length || inserts.some(line => !singleRow(line.slice(line.indexOf(' VALUES ') + 8))))
      throw Error('Unexpected non-single-row dump insert: ' + table);
    counts[table] = inserts.length;
  }
  return {version: 1, tables: TABLES, counts, sha256: hash(bytes), bytes: bytes.length,
    completion_marker: sql.trimEnd().split('\n').at(-1), format: 'mysqldump-single-transaction-hex-blob-single-row'};
}

function verifyBackup(folder) {
  const recorded = JSON.parse(fs.readFileSync(path.join(folder, 'database-backup.json'), 'utf8'));
  const actual = inspectDump(path.join(folder, 'database-before.sql'));
  if (JSON.stringify(recorded) !== JSON.stringify(actual)) throw Error('Database backup contents/row counts changed');
  const sidecar = fs.readFileSync(path.join(folder, 'database-before.sql.sha256'), 'utf8');
  if (sidecar !== actual.sha256 + '  database-before.sql\n') throw Error('Invalid database backup sidecar');
  return actual;
}

async function backup(live, folder) {
  live = fs.realpathSync(live);
  folder = fs.realpathSync(folder);
  if (live !== '/www/wwwroot/mooncci-source/server' || !/^\/www\/backup\/mooncci-cover-framing-main\.[A-Za-z0-9]+$/.test(folder))
    throw Error('Unexpected live or backup path');
  const env = require(path.join(live, 'node_modules/dotenv')).parse(fs.readFileSync(path.join(live, '.env')));
  if (!env.DB_USER || !env.DB_NAME || !/^[A-Za-z0-9_]+$/.test(env.DB_NAME)) throw Error('Missing database configuration');
  const mysql = require(path.join(live, 'node_modules/mysql2/promise'));
  const connection = await mysql.createConnection({host: env.DB_HOST || '127.0.0.1', port: Number(env.DB_PORT || 3306),
    user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME, charset: 'utf8mb4'});
  try {
    const [engines] = await connection.query('SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME IN (?)', [env.DB_NAME, TABLES]);
    if (engines.length !== TABLES.length || engines.some(row => row.ENGINE !== 'InnoDB'))
      throw Error('All five backed-up tables must exist and use InnoDB');
  } finally { await connection.end(); }
  const candidates = ['/www/server/mysql/bin/mysqldump', '/usr/bin/mysqldump', '/usr/bin/mariadb-dump'];
  const command = candidates.find(file => fs.existsSync(file) && spawnSync(file, ['--version'], {stdio: 'ignore'}).status === 0);
  if (!command) throw Error('Reliable mysqldump unavailable; release stopped before migration');
  const defaults = path.join(folder, '.mysql-defaults-' + crypto.randomBytes(8).toString('hex'));
  const quote = value => '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
  const contents = '[client]\n' + Object.entries({host: env.DB_HOST || '127.0.0.1', port: env.DB_PORT || '3306',
    user: env.DB_USER, password: env.DB_PASSWORD || ''}).map(([key, value]) => key + '=' + quote(value) + '\n').join('');
  const output = path.join(folder, 'database-before.sql');
  let descriptor;
  try {
    fs.writeFileSync(defaults, contents, {flag: 'wx', mode: 0o600});
    const help = spawnSync(command, ['--no-defaults', '--help'], {encoding: 'utf8', maxBuffer: 4 * 1024 * 1024});
    if (help.status !== 0) throw Error('Could not inspect mysqldump capabilities');
    const args = ['--defaults-file=' + defaults, '--single-transaction', '--quick', '--hex-blob',
      '--skip-extended-insert', '--skip-add-locks', '--skip-lock-tables', '--default-character-set=utf8mb4'];
    if (help.stdout.includes('set-gtid-purged')) args.push('--set-gtid-purged=OFF');
    if (help.stdout.includes('no-tablespaces')) args.push('--no-tablespaces');
    args.push(env.DB_NAME, ...TABLES);
    descriptor = fs.openSync(output, 'wx', 0o600);
    const result = spawnSync(command, args, {stdio: ['ignore', descriptor, 'ignore'], timeout: 600000});
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    if (result.status !== 0 || result.error) throw Error('MySQL snapshot failed; release stopped before migration');
    const metadata = inspectDump(output);
    fs.writeFileSync(path.join(folder, 'database-before.sql.sha256'), metadata.sha256 + '  database-before.sql\n', {mode: 0o600});
    fs.writeFileSync(path.join(folder, 'database-backup.json'), LFJSON(metadata), {mode: 0o600});
    verifyBackup(folder);
    console.log('PASS: recoverable schema/data backup; tables=' + TABLES.length + '; rows=' + Object.values(metadata.counts).reduce((a, b) => a + b, 0));
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(defaults)) fs.unlinkSync(defaults);
  }
}

module.exports = {inspectDump, verifyBackup};
if (require.main === module) {
  (async () => {
    if (process.argv[2] === 'verify') { verifyBackup(process.argv[3]); console.log('PASS: database backup bytes/counts/end marker'); }
    else if (process.argv[2] === 'create') await backup(process.argv[3], process.argv[4]);
    else throw Error('Use create LIVE BACKUP or verify BACKUP');
  })().catch(() => { console.error('Cover-framing database backup failed; inspect tools/configuration privately before retrying.'); process.exitCode = 1; });
}

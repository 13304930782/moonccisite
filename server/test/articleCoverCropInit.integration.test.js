const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

test('fresh initialization records cover framing and standard migration dry-run skips its DDL', {
  skip: process.env.COVER_CROP_INTEGRATION !== 'true',
}, async t => {
  const name = 'mooncci_qa_cover_init_' + process.pid;
  assert.match(name, /^mooncci_qa_cover_init_\d+$/);
  const env = {
    ...process.env,
    DB_HOST: '127.0.0.1', DB_PORT: process.env.TEST_DB_PORT || '33079',
    DB_USER: 'root', DB_PASSWORD: '', DB_NAME: name,
  };
  const connection = await require('mysql2/promise').createConnection({
    host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER, password: env.DB_PASSWORD,
  });
  let created = false;
  t.after(async () => {
    try { if (created) await connection.query('DROP DATABASE ' + name); }
    finally { await connection.end(); }
  });
  await connection.query('CREATE DATABASE ' + name + ' CHARACTER SET utf8mb4');
  created = true;
  await connection.query('USE ' + name);
  const script = (filename, args = []) => spawnSync(process.execPath,
    [path.join(__dirname, '../scripts', filename), ...args], { env, encoding: 'utf8', timeout: 60000 });
  const successful = result => {
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  };

  successful(script('init-db.js', ['--dry-run']));
  const [[empty]] = await connection.query(
    'SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema=DATABASE()');
  assert.equal(Number(empty.total), 0, 'initialization dry-run must leave the database empty');
  successful(script('init-db.js'));
  const [[column]] = await connection.query("SHOW COLUMNS FROM posts LIKE 'cover_crop'");
  assert.equal(column.Type.toLowerCase(), 'json');
  assert.equal(column.Null, 'YES');
  const filename = '202610130001_article_cover_crop.sql';
  const [[migration]] = await connection.query('SELECT checksum FROM schema_migrations WHERE filename=?', [filename]);
  assert.ok(migration, 'schema initialization must baseline the cover column migration');
  const sql = fs.readFileSync(path.join(__dirname, '../database/migrations', filename), 'utf8').trim();
  assert.equal(migration.checksum, crypto.createHash('sha256').update(sql).digest('hex'));

  const dryRun = script('migrate.js', ['--dry-run']);
  successful(dryRun);
  assert.match(dryRun.stdout, /\[migrate\] already applied: 202610130001_article_cover_crop\.sql/);
  assert.doesNotMatch(dryRun.stdout, /^\s+- 202610130001_article_cover_crop\.sql$/m,
    'standard upgrades must not attempt to add the already initialized cover column');
  const [[posts]] = await connection.query('SELECT COUNT(*) AS total FROM posts');
  assert.equal(Number(posts.total), 0);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { projectInput } = require('../src/lib/contentPlatform');
const { migrationSpec, migrate, liveDependencies } = require('../scripts/migrate-project-icon');

const project = { slug: 'test-project', name: 'Project', summary: 'Summary', stage: 'building', status: 'draft' };
const column = () => ({ Field: 'icon_image', Type: 'varchar(500)', Null: 'YES', Default: null, Extra: '' });
function fakeDatabase(options = {}) {
  const db = { column: options.column, ledger: options.ledger, statements: [], breakLedger: options.breakLedger };
  db.query = async (sql, values) => {
    db.statements.push({ sql, values });
    if (sql.includes('GET_LOCK')) return [[{ locked: options.lock ?? 1 }]];
    if (sql.startsWith('SHOW COLUMNS')) return [db.column ? [db.column] : []];
    if (sql.startsWith('SELECT checksum')) return [db.ledger ? [{ checksum: db.ledger }] : []];
    if (sql.startsWith('ALTER TABLE')) db.column = column();
    if (sql.startsWith('INSERT INTO')) {
      if (db.breakLedger) { db.breakLedger = false; throw Error('Interrupted ledger write'); }
      db.ledger = values[1];
    }
    return [[]];
  };
  return db;
}
const writes = db => db.statements.filter(({ sql }) => /^(ALTER|INSERT|UPDATE|DELETE|CREATE|DROP)/.test(sql));

test('project icons distinguish old clients, default, explicit removal and custom media', () => {
  assert.equal(Object.hasOwn(projectInput(project), 'icon_image'), false);
  assert.equal(projectInput({ ...project, icon_image: null }).icon_image, null);
  assert.equal(projectInput({ ...project, icon_image: '' }).icon_image, '');
  assert.equal(projectInput({ ...project, icon_image: ' /api/uploads/icon.png ' }).icon_image, '/api/uploads/icon.png');
  assert.equal(projectInput({ ...project, icon_image: 'https://example.test/icon.png' }).icon_image, 'https://example.test/icon.png');
  const inherited = Object.assign(Object.create({ icon_image: '' }), project);
  assert.equal(Object.hasOwn(projectInput(inherited), 'icon_image'), false);
  for (const value of [false, 1, {}, [], 'javascript:alert(1)', 'data:image/png,x', '/api/uploads/../env', 'https://user:pass@example.test/icon'])
    assert.throws(() => projectInput({ ...project, icon_image: value }));
});

test('project icon check is read-only and verify requires shape plus matching ledger', async () => {
  const pending = fakeDatabase();
  assert.equal((await migrate(pending, 'check')).state, 'pending');
  assert.equal(writes(pending).length, 0);
  await assert.rejects(migrate(pending, 'verify'), /not complete/);
  assert.equal(writes(pending).length, 0);
  const recoverable = fakeDatabase({ column: column() });
  assert.equal((await migrate(recoverable, 'check')).state, 'recoverable');
  assert.equal(writes(recoverable).length, 0);
  const complete = fakeDatabase({ column: column(), ledger: migrationSpec().checksum });
  assert.equal((await migrate(complete, 'verify')).state, 'complete');
  assert.equal(writes(complete).length, 0);
});

test('project icon apply adds only its column and safely resumes a DDL/ledger interruption', async () => {
  const db = fakeDatabase({ breakLedger: true });
  await assert.rejects(migrate(db, 'apply'), /Interrupted/);
  assert.deepEqual(db.column, column());
  assert.equal(db.ledger, undefined);
  assert.ok(db.statements.at(-1).sql.includes('RELEASE_LOCK'));
  assert.equal((await migrate(db, 'apply')).previous, 'recoverable');
  assert.equal(writes(db).filter(({ sql }) => sql.startsWith('ALTER')).length, 1);
  assert.equal(db.ledger, migrationSpec().checksum);
  assert.equal((await migrate(db, 'apply')).previous, 'complete');
  assert.equal(writes(db).length, 3); // one DDL, failed ledger attempt, successful retry
});

test('project icon runner refuses wrong shapes, checksums, missing recorded column and unavailable lock', async () => {
  for (const changed of [{ Type: 'text' }, { Type: 'varchar(255)' }, { Null: 'NO' }, { Default: '' }, { Extra: 'VIRTUAL GENERATED' }]) {
    const db = fakeDatabase({ column: { ...column(), ...changed } });
    await assert.rejects(migrate(db, 'apply'), /column shape/);
    assert.equal(writes(db).length, 0);
  }
  for (const db of [fakeDatabase({ column: column(), ledger: '0'.repeat(64) }), fakeDatabase({ ledger: migrationSpec().checksum }), fakeDatabase({ lock: 0 })]) {
    await assert.rejects(migrate(db, 'apply'));
    assert.equal(writes(db).length, 0);
  }
  await assert.rejects(migrate(fakeDatabase(), 'all'), /Invalid/);
});

test('project icon runner binds configuration to live .env instead of inherited DB variables', t => {
  const cache = path.resolve(__dirname, '../../.cache');
  fs.mkdirSync(cache, { recursive: true });
  const live = fs.mkdtempSync(path.join(cache, 'project-icon-env-'));
  t.after(() => {
    assert.ok(live.startsWith(cache + path.sep + 'project-icon-env-'));
    fs.rmSync(live, { recursive: true, force: true });
  });
  fs.writeFileSync(path.join(live, '.env'), 'DB_HOST=127.0.0.1\nDB_PORT=33079\nDB_USER=qa\nDB_PASSWORD=fixture-only\nDB_NAME=mooncci_qa_icons\n');
  for (const [file, target] of [['dotenv/index.js', 'dotenv'], ['mysql2/promise.js', 'mysql2/promise']]) {
    const dest = path.join(live, 'node_modules', file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, 'module.exports=require(' + JSON.stringify(require.resolve(target)) + ');\n');
  }
  const inherited = process.env.DB_NAME;
  process.env.DB_NAME = 'wrong_inherited_database';
  try {
    const { options } = liveDependencies(live);
    assert.deepEqual(options, { host: '127.0.0.1', port: 33079, user: 'qa', password: 'fixture-only', database: 'mooncci_qa_icons', charset: 'utf8mb4' });
    assert.equal(Object.hasOwn(options, 'multipleStatements'), false);
  } finally {
    if (inherited === undefined) delete process.env.DB_NAME;
    else process.env.DB_NAME = inherited;
  }
  assert.throws(() => liveDependencies('relative/server'), /absolute/);
});

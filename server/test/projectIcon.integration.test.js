// Opt in only against a newly created localhost QA database, never production.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { migrationSpec } = require('../scripts/migrate-project-icon');

test('fresh initialization baselines project icons and historical dry-run skips the additive DDL', {
  skip: process.env.PROJECT_ICON_INTEGRATION !== 'true',
}, async t => {
  const name = 'mooncci_qa_project_icon_init_' + process.pid;
  assert.match(name, /^mooncci_qa_project_icon_init_\d+$/);
  const env = { ...process.env, DB_HOST: '127.0.0.1', DB_PORT: process.env.TEST_DB_PORT || '33079', DB_USER: 'root', DB_PASSWORD: '', DB_NAME: name };
  const connection = await require('mysql2/promise').createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT), user: 'root', password: '' });
  let created = false;
  t.after(async () => { try { if (created) await connection.query('DROP DATABASE `' + name + '`'); } finally { await connection.end(); } });
  await connection.query('CREATE DATABASE `' + name + '` CHARACTER SET utf8mb4');
  created = true;
  await connection.query('USE `' + name + '`');
  const script = (filename, args = []) => spawnSync(process.execPath, [path.join(__dirname, '../scripts', filename), ...args], { env, encoding: 'utf8', timeout: 60000 });
  const initialize = script('init-db.js');
  assert.ifError(initialize.error);
  assert.equal(initialize.status, 0, initialize.stderr);
  const [[column]] = await connection.query("SHOW COLUMNS FROM projects LIKE 'icon_image'");
  assert.equal(column.Type.toLowerCase(), 'varchar(500)');
  assert.equal(column.Null, 'YES');
  assert.equal(column.Default, null);
  const spec = migrationSpec();
  const [[ledger]] = await connection.query('SELECT checksum FROM schema_migrations WHERE filename=?', [spec.filename]);
  assert.equal(ledger.checksum, spec.checksum);
  const dry = script('migrate.js', ['--dry-run']);
  assert.ifError(dry.error);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /already applied: 202610150001_project_icon_image\.sql/);
  assert.doesNotMatch(dry.stdout, /^\s+- 202610150001_project_icon_image\.sql$/m);
  assert.equal((await connection.query('SELECT COUNT(*) n FROM projects'))[0][0].n, 0);
});

test('project icon migration recovery, editable persistence, public visibility and existing permissions', {
  skip: process.env.PROJECT_ICON_INTEGRATION !== 'true',
}, async t => {
  const name = 'mooncci_qa_project_icon_' + process.pid;
  assert.match(name, /^mooncci_qa_project_icon_\d+$/);
  const port = Number(process.env.TEST_DB_PORT || 33079);
  Object.assign(process.env, { DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_USER: 'root', DB_PASSWORD: '', DB_NAME: name,
    JWT_SECRET: 'isolated-project-icon-test-secret-32-characters', LOGIN_SESSIONS_ENABLED: 'false',
    MAIL_ENABLED: 'false', GITHUB_SYNC_ENABLED: 'false', NEWSLETTER_DELIVERY_ENABLED: 'false' });
  const setup = await require('mysql2/promise').createConnection({ host: '127.0.0.1', port, user: 'root', password: '', multipleStatements: true });
  await setup.query('CREATE DATABASE `' + name + '` CHARACTER SET utf8mb4');
  let apiServer, db, authDb;
  const cache = path.resolve(__dirname, '../../.cache');
  fs.mkdirSync(cache, { recursive: true });
  const live = fs.mkdtempSync(path.join(cache, 'project-icon-integration-'));
  t.after(async () => {
    if (apiServer) await new Promise(resolve => apiServer.close(resolve));
    if (db) await db.end();
    if (authDb) await authDb.end();
    await setup.query('DROP DATABASE `' + name + '`');
    await setup.end();
    assert.ok(live.startsWith(cache + path.sep + 'project-icon-integration-'));
    fs.rmSync(live, { recursive: true, force: true });
  });
  await setup.query('USE `' + name + '`');
  await setup.query(fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8'));
  await setup.query(fs.readFileSync(path.join(__dirname, '../database/migrations/202609090002_auth_revocation.sql'), 'utf8'));
  await setup.query('ALTER TABLE projects DROP COLUMN icon_image');
  await setup.query("INSERT INTO projects(slug,name,summary,content,cover_image,tech_stack,status,stage) VALUES ('legacy-project','Legacy','Original summary','Original content','/api/uploads/screen.png','','published','active')");
  await setup.query('CREATE TABLE schema_migrations(filename VARCHAR(255) PRIMARY KEY,checksum CHAR(64) NOT NULL)');
  await setup.query('INSERT INTO schema_migrations VALUES (?,?)', ['historical-fixture.sql', 'a'.repeat(64)]);
  fs.writeFileSync(path.join(live, '.env'), `DB_HOST=127.0.0.1\nDB_PORT=${port}\nDB_USER=root\nDB_PASSWORD=\nDB_NAME=${name}\n`);
  for (const [file, target] of [['dotenv/index.js', 'dotenv'], ['mysql2/promise.js', 'mysql2/promise']]) {
    const dest = path.join(live, 'node_modules', file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, 'module.exports=require(' + JSON.stringify(require.resolve(target)) + ');\n');
  }
  const runner = mode => spawnSync(process.execPath, [path.join(__dirname, '../scripts/migrate-project-icon.js'), live, '--' + mode], {
    encoding: 'utf8', timeout: 40000, env: { ...process.env, DB_HOST: 'invalid.inherited.test', DB_PORT: '1', DB_USER: 'wrong', DB_PASSWORD: 'wrong', DB_NAME: 'wrong_inherited_database' },
  });
  const run = mode => { const result = runner(mode); assert.equal(result.status, 0, result.stderr || String(result.error)); return JSON.parse(result.stdout); };
  assert.equal(run('check').state, 'pending');
  assert.equal((await setup.query('SELECT COUNT(*) n FROM schema_migrations'))[0][0].n, 1);
  assert.equal(runner('verify').status, 1);
  assert.equal(run('apply').state, 'complete');
  assert.equal(run('verify').state, 'complete');
  assert.equal(run('apply').previous, 'complete');
  const [[legacy]] = await setup.query("SELECT content,cover_image,icon_image FROM projects WHERE slug='legacy-project'");
  assert.deepEqual(legacy, { content: 'Original content', cover_image: '/api/uploads/screen.png', icon_image: null });
  const spec = migrationSpec();
  // Resume a real DDL/ledger interruption while preserving saved icon values.
  await setup.query("UPDATE projects SET icon_image='/api/uploads/legacy-icon.png' WHERE slug='legacy-project'");
  await setup.query('DELETE FROM schema_migrations WHERE filename=?', [spec.filename]);
  assert.equal(run('check').state, 'recoverable');
  assert.equal(run('apply').previous, 'recoverable');
  assert.equal((await setup.query("SELECT icon_image FROM projects WHERE slug='legacy-project'"))[0][0].icon_image, '/api/uploads/legacy-icon.png');
  await setup.query('UPDATE schema_migrations SET checksum=? WHERE filename=?', ['b'.repeat(64), spec.filename]);
  for (const mode of ['check', 'apply', 'verify']) assert.equal(runner(mode).status, 1);
  await setup.query('UPDATE schema_migrations SET checksum=? WHERE filename=?', [spec.checksum, spec.filename]);
  await setup.query('ALTER TABLE projects MODIFY COLUMN icon_image VARCHAR(255) NULL DEFAULT NULL');
  assert.equal(runner('apply').status, 1);
  await setup.query('ALTER TABLE projects MODIFY COLUMN icon_image VARCHAR(500) NULL DEFAULT NULL');
  await setup.query("ALTER TABLE projects ALTER COLUMN icon_image SET DEFAULT ''");
  assert.equal(runner('verify').status, 1);
  await setup.query('ALTER TABLE projects ALTER COLUMN icon_image SET DEFAULT NULL');
  assert.equal(run('verify').state, 'complete');
  assert.equal((await setup.query('SELECT checksum FROM schema_migrations WHERE filename=?', ['historical-fixture.sql']))[0][0].checksum, 'a'.repeat(64));

  const users = {};
  for (const role of ['owner', 'admin', 'editor', 'user']) {
    const [row] = await setup.query('INSERT INTO users(username,email,password_hash,role,status) VALUES (?,?,?,?,?)', [role, role + '@example.invalid', 'unused', role, 'active']);
    users[role] = row.insertId;
  }
  db = require('../src/platformDb');
  authDb = require('../src/db');
  const express = require('express'), jwt = require('jsonwebtoken');
  const app = express(), content = require('../src/routes/contentPlatform');
  app.use(express.json());
  app.use('/api', content.router);
  app.use('/api/admin', content.admin);
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ message: err.message }));
  apiServer = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
  const base = `http://127.0.0.1:${apiServer.address().port}/api`;
  async function request(url, method = 'GET', body, actor = 'owner') {
    const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json',
      ...(actor ? { Cookie: 'mooncci_token=' + jwt.sign({ id: users[actor], sessionStartedAt: Date.now() }, process.env.JWT_SECRET) } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() };
  }
  const project = { slug: 'editable-icon', name: 'Editable', summary: 'Real summary', content: 'Original content', cover_image: '/api/uploads/screenshot.png',
    icon_image: '/api/uploads/icon.png', tech_stack: 'Swift', status: 'draft', stage: 'building', repo: '', featured_rank: 1 };
  assert.equal((await request('/admin/projects', 'POST', project, null)).status, 401);
  for (const actor of ['editor', 'user']) assert.equal((await request('/admin/projects', 'POST', project, actor)).status, 403);
  const created = await request('/admin/projects', 'POST', project);
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.equal((await request('/projects/editable-icon', 'GET', undefined, null)).status, 404);
  assert.ok(!(await request('/projects', 'GET', undefined, null)).data.items.some(item => item.id === id));
  assert.equal((await request('/admin/projects')).data.items.find(item => item.id === id).icon_image, project.icon_image);
  const update = { ...project, status: 'published', icon_image: 'https://example.test/custom-icon.png' };
  await setup.query("INSERT INTO media_assets(filename,url,width,height) VALUES ('screenshot.png','/api/uploads/screenshot.png',1600,879),('unrelated.png','/api/uploads/unrelated.png',800,800)");
  assert.equal((await request('/admin/projects/' + id, 'PUT', update, 'admin')).status, 200);
  for (const url of ['/projects', '/projects?featured=true'])
    assert.equal((await request(url, 'GET', undefined, null)).data.items.find(item => item.id === id).icon_image, update.icon_image);
  const publicProject = (await request('/projects/editable-icon', 'GET', undefined, null)).data;
  assert.equal(publicProject.icon_image, update.icon_image);
  assert.equal(publicProject.cover_image, project.cover_image);
  assert.deepEqual(publicProject.image_dimensions,{'/api/uploads/screenshot.png':{width:1600,height:879}});
  await setup.query("UPDATE media_assets SET status='trashed' WHERE filename='screenshot.png'");
  assert.deepEqual((await request('/projects/editable-icon','GET',undefined,null)).data.image_dimensions,{});
  await setup.query("UPDATE media_assets SET status='active' WHERE filename='screenshot.png'");
  const { icon_image: _icon, ...oldClient } = update;
  oldClient.summary = 'Old client edit';
  assert.equal((await request('/admin/projects/' + id, 'PUT', oldClient, 'admin')).status, 200);
  assert.equal((await request('/projects/editable-icon', 'GET', undefined, null)).data.icon_image, update.icon_image);
  for (const icon_image of ['', null, '/api/uploads/replacement.webp']) {
    assert.equal((await request('/admin/projects/' + id, 'PUT', { ...update, icon_image }, 'admin')).status, 200);
    assert.equal((await request('/projects/editable-icon', 'GET', undefined, null)).data.icon_image, icon_image);
    assert.equal((await request('/admin/projects')).data.items.find(item => item.id === id).icon_image, icon_image);
  }
  for (const icon_image of [true, 2, {}, 'javascript:alert(1)', '/api/uploads/../secret'])
    assert.equal((await request('/admin/projects/' + id, 'PUT', { ...update, icon_image }, 'admin')).status, 400);
  for (const actor of ['user', 'editor']) assert.equal((await request('/admin/projects/' + id, 'PUT', update, actor)).status, 403);
  assert.equal((await request('/projects/editable-icon', 'GET', undefined, null)).data.icon_image, '/api/uploads/replacement.webp');
  assert.equal((await request('/admin/projects/' + id, 'PUT', { ...update, repo: 'qa/repo' }, 'admin')).status, 403);
  const { icon_image: _removed, ...oldCreate } = { ...project, slug: 'old-created-project' };
  const oldCreated = await request('/admin/projects', 'POST', oldCreate);
  assert.equal(oldCreated.status, 201);
  assert.equal((await setup.query('SELECT icon_image FROM projects WHERE id=?', [oldCreated.data.id]))[0][0].icon_image, null);
});

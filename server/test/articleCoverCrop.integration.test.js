const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

test('cover framing migration, drafts, revisions, review snapshots and public reads', {
  skip: process.env.COVER_CROP_INTEGRATION !== 'true',
}, async t => {
  const name = 'mooncci_qa_crop_' + process.pid;
  Object.assign(process.env, {
    DB_HOST: '127.0.0.1', DB_PORT: process.env.TEST_DB_PORT || '33079', DB_USER: 'root', DB_PASSWORD: '', DB_NAME: name,
    JWT_SECRET: 'cover-framing-isolated-local-test-secret-32-characters', SITE_URL: 'https://mooncci.site',
    CSRF_TRUSTED_ORIGINS: 'https://mooncci.site', PUBLISHING_ENABLED: 'true', MAIL_ENABLED: 'false',
    ENGAGEMENT_ENABLED: 'false', NEWSLETTER_DELIVERY_ENABLED: 'false', GITHUB_SYNC_ENABLED: 'false',
  });
  const setup = await require('mysql2/promise').createConnection({
    host: '127.0.0.1', port: Number(process.env.DB_PORT), user: 'root', multipleStatements: true,
  });
  await setup.query('CREATE DATABASE ' + name + ' CHARACTER SET utf8mb4');
  let db, server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) { await db.end(); await require('../src/platformDb').end(); }
    await setup.query('DROP DATABASE ' + name);
    await setup.end();
  });
  await setup.query('USE ' + name);
  await setup.query(fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8'));
  await setup.query(fs.readFileSync(path.join(__dirname, '../database/migrations/202609090002_auth_revocation.sql'), 'utf8'));
  const users = {};
  for (const [label, role] of [['owner', 'owner'], ['admin', 'admin'], ['author', 'user'], ['other', 'editor']]) {
    const [row] = await setup.query('INSERT INTO users(username,email,password_hash,role) VALUES (?,?,?,?)',
      [label, label + '@example.test', 'unused', role]);
    users[label] = row.insertId;
  }
  const cropA = { card: { x: 0.25, y: 0.75, zoom: 1.4 }, detail: { x: 0.65, y: 0.1, zoom: 2 } };
  const cropB = { card: { x: 0.85, y: 0.2, zoom: 2.5 }, detail: null };
  const image = 'https://example.test/cover.png';
  const parse = value => typeof value === 'string' ? JSON.parse(value) : value;

  // Upgrade a pre-feature row, then safely replay only this migration.
  await setup.query('ALTER TABLE posts DROP COLUMN cover_crop');
  await setup.query('INSERT INTO posts(title,slug,content,cover_image,status,author_id) VALUES (?,?,?,? ,"published",?)',
    ['Legacy cover', 'legacy-cover', 'Legacy body', image, users.owner]);
  await setup.query('CREATE TABLE schema_migrations(filename VARCHAR(255) PRIMARY KEY,checksum CHAR(64) NOT NULL)');
  await setup.query('INSERT INTO schema_migrations VALUES (?,?)', ['historical-fixture.sql', 'a'.repeat(64)]);
  const cacheRoot = path.resolve(__dirname, '../../.cache');
  fs.mkdirSync(cacheRoot, { recursive: true });
  const live = fs.mkdtempSync(path.join(cacheRoot, 'crop-migration-'));
  t.after(() => {
    assert.ok(live.startsWith(cacheRoot + path.sep + 'crop-migration-'));
    fs.rmSync(live, { recursive: true, force: true });
  });
  fs.writeFileSync(path.join(live, '.env'), Object.entries({DB_HOST: '127.0.0.1', DB_PORT: process.env.DB_PORT,
    DB_USER: 'root', DB_PASSWORD: '', DB_NAME: name}).map(([key, value]) => key + '=' + value + '\n').join(''));
  for (const [file, target] of [['dotenv/index.js', 'dotenv'], ['mysql2/promise.js', 'mysql2/promise']]) {
    const destination = path.join(live, 'node_modules', file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, 'module.exports=require(' + JSON.stringify(require.resolve(target)) + ');\n');
  }
  const migrationFile = '202610130001_article_cover_crop.sql';
  const runMigration = () => spawnSync(process.execPath, [path.join(__dirname, '../scripts/migrate-article-cover-crop.js'), live],
    { env: {...process.env, DB_HOST: 'invalid.inherited.test', DB_PORT: '1', DB_USER: 'wrong',
      DB_PASSWORD: 'wrong', DB_NAME: 'wrong_inherited_database'}, encoding: 'utf8' });
  for (let i = 0; i < 2; i++) { const result = runMigration(); assert.equal(result.status, 0, result.stderr); }
  const [[legacy]] = await setup.query('SELECT * FROM posts WHERE slug="legacy-cover"');
  assert.equal(legacy.cover_crop, null);
  assert.equal(legacy.content, 'Legacy body');
  assert.equal(legacy.cover_image, image);
  assert.equal((await setup.query('SELECT checksum FROM schema_migrations WHERE filename="historical-fixture.sql"'))[0][0].checksum, 'a'.repeat(64));
  const [[ledger]] = await setup.query('SELECT checksum FROM schema_migrations WHERE filename=?', [migrationFile]);
  // Resume after an interrupted ledger write/fresh-install schema without DDL.
  await setup.query('DELETE FROM schema_migrations WHERE filename=?', [migrationFile]);
  assert.equal(runMigration().status, 0);
  await setup.query('UPDATE schema_migrations SET checksum=? WHERE filename=?', ['b'.repeat(64), migrationFile]);
  assert.equal(runMigration().status, 1);
  await setup.query('UPDATE schema_migrations SET checksum=? WHERE filename=?', [ledger.checksum, migrationFile]);

  db = require('../src/db');
  const jwt = require('jsonwebtoken');
  server = require('../src/index').listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const request = (url, method = 'GET', body, actor = 'owner') => fetch('http://127.0.0.1:' + server.address().port + '/api' + url, {
    method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', Origin: 'https://mooncci.site',
      Cookie: actor ? 'mooncci_token=' + jwt.sign({ id: users[actor], sessionStartedAt: Date.now() }, process.env.JWT_SECRET) : '' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  async function ok(url, method, body, actor) {
    const response = await request(url, method, body, actor), result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    return result;
  }
  const publicPost = id => ok('/posts/' + id, 'GET', null, null);
  const save = (d, coverCrop, actor = 'owner') => ok('/article-drafts/' + d.id, 'PUT',
    { version: d.version, save_kind: 'manual', payload: { ...d.payload, cover_crop: coverCrop } }, actor);
  const create = (actor, crop = cropA) => ok('/article-drafts', 'POST', { id: crypto.randomUUID(), payload: {
    title: 'Framed cover', slug: 'crop-' + crypto.randomUUID(), content: 'Original article body', cover_image: image, cover_crop: crop,
  } }, actor);
  const act = (d, action, actor = 'admin', extra = {}) => ok('/publishing/' + d.id + '/' + action, 'POST', { version: d.version, ...extra }, actor);

  assert.equal((await publicPost(legacy.id)).cover_crop, null);
  const directBody = { title: 'Direct framing', slug: 'crop-direct', content: 'Direct body', cover_image: image, cover_crop: cropA, status: 'published' };
  assert.equal((await request('/posts', 'POST', { ...directBody, cover_crop: { ...cropA, unexpected: true } })).status, 400);
  await ok('/posts', 'POST', directBody);
  const [[createdPost]] = await db.query('SELECT id FROM posts WHERE slug=?', [directBody.slug]);
  assert.deepEqual((await publicPost(createdPost.id)).cover_crop, cropA);
  let draft = await create('owner');
  assert.deepEqual(draft.payload.cover_crop, cropA);
  assert.deepEqual((await ok('/article-drafts/' + draft.id)).payload.cover_crop, cropA);
  assert.equal((await request('/article-drafts/' + draft.id, 'GET', null, null)).status, 401);
  assert.equal((await request('/article-drafts/' + draft.id, 'PUT', { version: draft.version, payload: draft.payload }, 'other')).status, 404);
  const invalid = { ...cropA, card: { ...cropA.card, zoom: '2' } };
  assert.equal((await request('/article-drafts/' + draft.id, 'PUT', { version: draft.version, payload: { ...draft.payload, cover_crop: invalid } })).status, 400);
  assert.equal((await ok('/article-drafts/' + draft.id)).version, draft.version);
  draft = await ok('/article-drafts/' + draft.id + '/publish', 'POST', { version: draft.version });
  assert.deepEqual((await publicPost(draft.post_id)).cover_crop, cropA);
  assert.deepEqual((await ok('/posts', 'GET', null, null)).find(p => p.id === draft.post_id).cover_crop, cropA);
  assert.deepEqual((await ok('/posts?format=paged', 'GET', null, null)).items.find(p => p.id === draft.post_id).cover_crop, cropA);

  // A crop-only edit is a real draft version and revision; public content waits for publication.
  const version = draft.version;
  draft = await save(draft, cropB);
  assert.equal(draft.version, version + 1);
  assert.equal(draft.dirty, 1);
  assert.equal(draft.payload.content, 'Original article body');
  assert.deepEqual((await publicPost(draft.post_id)).cover_crop, cropA);
  const history = await ok('/article-drafts/' + draft.id + '/revisions');
  const manual = await ok('/article-drafts/' + draft.id + '/revisions/' + history.items.find(r => r.kind === 'manual').id);
  assert.deepEqual(manual.payload.cover_crop, cropB);
  const comparison = await ok('/article-drafts/' + draft.id + '/conflict');
  assert.deepEqual(comparison.post.payload.cover_crop, cropA);
  assert.deepEqual(comparison.draft.payload.cover_crop, cropB);
  draft = await ok('/article-drafts/' + draft.id + '/publish', 'POST', { version: draft.version });
  assert.deepEqual((await publicPost(draft.post_id)).cover_crop, cropB);

  // Restoring a historical snapshot without the field clears both current crops.
  const oldPayload = { ...draft.payload }; delete oldPayload.cover_crop;
  const [oldRevision] = await db.query('INSERT INTO article_revisions(post_id,draft_id,actor_id,kind,payload,content_hash) VALUES (?,?,?,"manual",?,?)',
    [draft.post_id, draft.id, users.owner, JSON.stringify(oldPayload), 'c'.repeat(64)]);
  assert.equal((await ok('/article-drafts/' + draft.id + '/revisions/' + oldRevision.insertId)).payload.cover_crop, null);
  draft = await ok('/article-drafts/' + draft.id + '/revisions/' + oldRevision.insertId + '/restore', 'POST', { version: draft.version });
  assert.equal(draft.payload.cover_crop, null);
  assert.deepEqual((await publicPost(draft.post_id)).cover_crop, cropB);
  draft = await save(draft, cropA);
  await ok('/article-drafts/' + draft.id, 'DELETE', { version: draft.version });
  draft = await ok('/article-drafts/' + draft.id);
  assert.deepEqual(draft.payload.cover_crop, cropB);
  assert.equal(draft.dirty, 0);

  // Legacy partial PUT supports crop-only updates, retains omitted framing on
  // the same source, and clears it on replacement or cover removal.
  let direct = await publicPost(legacy.id);
  await ok('/posts/' + legacy.id, 'PUT', { version: direct.version, cover_crop: cropA });
  direct = await publicPost(legacy.id); assert.deepEqual(direct.cover_crop, cropA);
  assert.equal((await request('/posts/' + legacy.id, 'PUT', { version: direct.version, cover_crop: cropB }, null)).status, 401);
  assert.equal((await request('/posts/' + legacy.id, 'PUT', { version: direct.version, cover_crop: cropB }, 'other')).status, 403);
  await ok('/posts/' + legacy.id, 'PUT', { version: direct.version, title: 'Same source' });
  direct = await publicPost(legacy.id); assert.deepEqual(direct.cover_crop, cropA);
  await ok('/posts/' + legacy.id, 'PUT', { version: direct.version, cover_image: 'https://example.test/replacement.png' });
  direct = await publicPost(legacy.id); assert.equal(direct.cover_crop, null);
  await ok('/posts/' + legacy.id, 'PUT', { version: direct.version, cover_crop: cropB });
  direct = await publicPost(legacy.id);
  await ok('/posts/' + legacy.id, 'PUT', { version: direct.version, cover_image: '', cover_crop: cropA });
  assert.equal((await publicPost(legacy.id)).cover_crop, null);

  // Submitted and scheduled publication keeps the reviewed framing snapshot.
  let reviewed = await create('author', cropB);
  assert.equal((await request('/article-drafts/' + reviewed.id + '/publish', 'POST', { version: reviewed.version }, 'author')).status, 403);
  await act(reviewed, 'submit', 'author');
  const [[workflow]] = await db.query('SELECT snapshot FROM article_workflows WHERE draft_id=?', [reviewed.id]);
  assert.deepEqual(parse(workflow.snapshot).cover_crop, cropB);
  const queue = await ok('/publishing/queue', 'GET', null, 'admin');
  assert.deepEqual(parse(queue.items.find(item => item.draft_id === reviewed.id).snapshot).cover_crop, cropB);
  assert.equal((await request('/article-drafts/' + reviewed.id, 'PUT', { version: reviewed.version, payload: { ...reviewed.payload, cover_crop: cropA } }, 'author')).status, 409);
  assert.equal((await request('/publishing/' + reviewed.id + '/approve', 'POST', { version: reviewed.version }, 'author')).status, 403);
  await act(reviewed, 'approve');
  await act(reviewed, 'schedule', 'admin', { scheduled_at: new Date(Date.now() + 60000).toISOString() });
  await db.query('UPDATE article_workflows SET scheduled_at=? WHERE draft_id=?', [Date.now() - 1000, reviewed.id]);
  await require('../src/services/articleWorkflow').runDue();
  reviewed = await ok('/article-drafts/' + reviewed.id, 'GET', null, 'author');
  assert.equal(reviewed.workflow.state, 'published');
  assert.deepEqual((await publicPost(reviewed.post_id)).cover_crop, cropB);

  // Every public image-bearing article collection uses the same parsed value.
  await ok('/bookmarks/' + reviewed.post_id, 'PUT', null, 'author');
  assert.deepEqual((await ok('/bookmarks', 'GET', null, 'author')).items[0].cover_crop, cropB);
  const series = await ok('/series', 'POST', { title: 'Crop QA', slug: 'crop-qa' }, 'admin');
  await ok('/series/' + series.id + '/articles', 'PUT', { post_ids: [reviewed.post_id, draft.post_id] }, 'admin');
  assert.deepEqual((await ok('/series/crop-qa', 'GET', null, null)).items.map(p => p.cover_crop), [cropB, cropB]);
  await db.query('UPDATE posts SET status="draft" WHERE id=?', [reviewed.post_id]);
  const hidden = await request('/posts/' + reviewed.post_id, 'GET', null, null);
  assert.equal(hidden.status, 404); assert.equal((await hidden.json()).cover_crop, undefined);
  const unavailable = (await ok('/bookmarks', 'GET', null, 'author')).items[0];
  assert.equal(unavailable.available, false); assert.equal(unavailable.cover_crop, undefined);
  assert.deepEqual((await ok('/series/crop-qa', 'GET', null, null)).items.map(p => p.id), [draft.post_id]);
  await db.query('UPDATE posts SET status="published" WHERE id=?', [reviewed.post_id]);

  // Defensive reads make bad historic metadata harmless without deleting it.
  await db.query('UPDATE posts SET cover_crop=? WHERE id=?', [JSON.stringify({ ...cropB, unexpected: true }), reviewed.post_id]);
  assert.equal((await publicPost(reviewed.post_id)).cover_crop, null);
  assert.equal((await ok('/bookmarks', 'GET', null, 'author')).items[0].cover_crop, null);
  assert.equal((await ok('/series/crop-qa', 'GET', null, null)).items[0].cover_crop, null);
  await db.query('UPDATE posts SET cover_crop=? WHERE id=?', [JSON.stringify(cropB), reviewed.post_id]);

  // Same-asset URL synchronization keeps framing and records it in history.
  const filename = 'qa-crop-media-' + process.pid + '.png';
  const renamed = 'qa-crop-renamed-' + process.pid + '.png';
  const uploadRoot = path.resolve(__dirname, '../uploads');
  const oldFile = path.join(uploadRoot, filename), nextFile = path.join(uploadRoot, renamed);
  assert.equal(path.dirname(oldFile), uploadRoot); assert.equal(path.dirname(nextFile), uploadRoot);
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jI2kAAAAASUVORK5CYII=', 'base64');
  fs.writeFileSync(oldFile, bytes, { flag: 'wx' });
  t.after(() => { fs.rmSync(oldFile, { force: true }); fs.rmSync(nextFile, { force: true }); });
  await db.query('INSERT INTO media_assets(filename,url,uploaded_by) VALUES (?,?,?)', [filename, '/api/uploads/' + filename, users.owner]);
  await db.query('UPDATE posts SET cover_image=?,cover_crop=? WHERE id=?', ['/api/uploads/' + filename, JSON.stringify(cropA), legacy.id]);
  await ok('/upload/media/' + filename + '/rename', 'PUT', { filename: renamed });
  const renamedPost = await publicPost(legacy.id);
  assert.equal(renamedPost.cover_image, '/api/uploads/' + renamed);
  assert.deepEqual(renamedPost.cover_crop, cropA);
  assert.deepEqual(fs.readFileSync(nextFile), bytes);
  const [[renamedHistory]] = await db.query('SELECT payload FROM article_revisions WHERE post_id=? ORDER BY id DESC LIMIT 1', [legacy.id]);
  assert.deepEqual(parse(renamedHistory.payload).cover_crop, cropA);
});

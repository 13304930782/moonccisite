const test = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = 'summary-provenance-test-secret-at-least-32-characters';
process.env.ENGAGEMENT_ENABLED = 'false';
process.env.PUBLISHING_ENABLED = 'false';
const proof = require('../src/lib/articleSummaryProof');
const { publish, payload } = require('../src/lib/articlePublishing');

test('draft publishing stores verified AI origin and clears it for manual summaries', async () => {
  for (const mode of ['ai', 'manual', '']) for (const existing of [false, true]) {
    const p = payload({ title: 'Title', slug: 'title', content: 'Body', summary: 'Summary', summary_mode: mode });
    if (mode === 'ai') p.summary_receipt = proof.signature(p);
    let saved;
    const c = { query: async (sql, values) => {
      if (sql.startsWith('INSERT INTO posts')) { saved = values; assert.match(sql, /tags,summary_mode,status/); return [{ insertId: 1 }]; }
      if (sql.startsWith('UPDATE posts SET title=')) { saved = values; assert.match(sql, /tags=\?,summary_mode=\?,status=/); return [{ affectedRows: 1 }]; }
      if (sql.startsWith('SELECT * FROM posts')) return [[{ id: 1, author_id: 1, version: 1 }]];
      if (sql.startsWith('SELECT post_id FROM article_slug_aliases')) return [[{post_id:1}]];
      if (sql.startsWith('SELECT')) return [[]];
      return [{ insertId: 1 }];
    } };
    await publish(c, { id: 'draft', author_id: 1, payload: p, post_id: existing ? 1 : null, base_version: 1 }, { id: 1, role: 'owner' });
    assert.equal(saved[8], mode);
  }
  await assert.rejects(publish({ query: async () => { throw Error('must not write'); } },
    { payload: { title: 'Title', content: 'Body', summary: 'Forged', summary_mode: 'ai' } }, { id: 1 }), /重新生成/);
});

test('direct updates retain origin only for unchanged or verified summaries', async t => {
  const db = require('../src/db');
  const originalQuery = db.query, originalConnection = db.getConnection;
  const auth = require('../src/middleware/auth');
  const originals = { authRequired: auth.authRequired, editorOrAdmin: auth.editorOrAdmin };
  auth.authRequired = (req, _res, next) => { req.user = { id: 1, role: 'owner' }; next(); };
  auth.editorOrAdmin = (_req, _res, next) => next();
  let row = { id: 1, author_id: 1, version: 1, title: 'Title', slug: 'title', content: 'Body', summary: 'AI summary', summary_mode: 'ai', status: 'draft', tags: '[]' };
  const query = async (sql, values) => {
    if (sql.startsWith('SELECT * FROM posts')) return [[{ ...row }]];
    if (sql.startsWith('SELECT post_id FROM article_slug_aliases')) return [[{post_id:1}]];
      if (sql.startsWith('SELECT')) return [[]];
    if (sql.startsWith('UPDATE posts SET title=')) {
      assert.match(sql, /tags=\?,summary_mode=\?,status=/);
      row = { ...row, summary: values[2], summary_mode: values[8], version: row.version + 1 };
    }
    return [{ affectedRows: 1, insertId: 1 }];
  };
  db.query = query;
  db.getConnection = async () => ({ query, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {} });
  const express = require('express'), app = express();
  app.use(express.json());
  delete require.cache[require.resolve('../src/routes/posts')];
  app.use('/posts', require('../src/routes/posts'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.query = originalQuery; db.getConnection = originalConnection; Object.assign(auth, originals); });
  const update = async input => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/posts/1`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: row.version, ...input }) });
    assert.equal(response.status, 200, await response.text());
  };
  await update({ category: 'Updated category' });
  assert.equal(row.summary_mode, 'ai');
  await update({ summary: 'Hand edited' });
  assert.equal(row.summary_mode, 'manual');
  await update({ summary: 'Spoofed AI', summary_mode: 'ai' });
  assert.equal(row.summary_mode, 'manual');
  const generated = { ...row, tags: [], category: '', summary: 'Verified AI', summary_mode: 'ai' };
  await update({ ...generated, summary_receipt: proof.signature(generated) });
  assert.equal(row.summary_mode, 'ai');
});

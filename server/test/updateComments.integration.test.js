const test = require('node:test');
const assert = require('node:assert/strict');
test('updates share moderation, replies and likes while isolating posts, drafts and other updates',
  { skip: process.env.CONTENT_INTEGRATION !== 'true' }, async t => {
    assert.match(process.env.DB_NAME || '', /^mooncci_qa(?:_|$)/);
    const db = require('../src/db'), platform = require('../src/platformDb');
    t.mock.method(require('../src/lib/mailer'), 'sendCommentNotification', async () => ({ sent: false }));
    t.mock.method(require('../src/lib/mailer'), 'sendCommentReviewNotification', async () => ({ sent: false }));
    const app = require('../src/index'), jwt = require('jsonwebtoken');
    const server = app.listen(0, '127.0.0.1');
    await new Promise(r => server.once('listening', r));
    const suffix = Date.now();
    const [owner] = await db.query("INSERT INTO users(username,email,password_hash,role,status,can_comment) VALUES (?,?,'fixture','owner','active',1)", [`uc-owner-${suffix}`, `uco${suffix}@example.test`]);
    const [reader] = await db.query("INSERT INTO users(username,email,password_hash,role,status,can_comment) VALUES (?,?,'fixture','user','active',1)", [`uc-user-${suffix}`, `ucu${suffix}@example.test`]);
    const [note] = await db.query("INSERT INTO updates(content,status,author_id,published_at) VALUES ('note fixture','published',?,NOW())", [owner.insertId]);
    const [other] = await db.query("INSERT INTO updates(content,status,author_id) VALUES ('draft fixture','draft',?)", [owner.insertId]);
    const [post] = await db.query("INSERT INTO posts(title,slug,content,status,author_id) VALUES ('post fixture',?,'body','published',?)", [`uc-${suffix}`, owner.insertId]);
    t.after(async () => {
      await new Promise(r => server.close(r));
      await db.query('DELETE FROM updates WHERE id IN (?,?)', [note.insertId, other.insertId]);
      await db.query('DELETE FROM posts WHERE id=?', [post.insertId]);
      await db.query('DELETE FROM users WHERE id IN (?,?)', [owner.insertId, reader.insertId]);
      await db.end(); await platform.end();
    });
    const request = (path, id, method = 'GET', body) => fetch(`http://127.0.0.1:${server.address().port}/api${path}`, {
      method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest',
        ...(id ? { Cookie: `mooncci_token=${jwt.sign({ id }, process.env.JWT_SECRET)}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const endpoint = `/comments/update/${note.insertId}`;
    assert.equal((await request(endpoint, null, 'POST', { content: 'anonymous' })).status, 401);
    assert.equal((await request(`/comments/update/${other.insertId}`)).status, 404);
    assert.equal((await request(`/comments/update/${other.insertId}`, owner.insertId, 'POST', { content: 'draft' })).status, 404);
    assert.equal((await request(endpoint, reader.insertId, 'POST', { content: 'pending note' })).status, 200);
    assert.deepEqual(await (await request(endpoint)).json(), []);
    const pending = await (await request(endpoint, reader.insertId)).json();
    assert.equal(pending.length, 1); assert.equal(pending[0].status, 'pending');
    assert.equal(pending[0].post_id, null); assert.equal(pending[0].update_id, note.insertId);
    assert.equal((await request(`/admin/comments/${pending[0].id}`, owner.insertId, 'PUT', { status: 'visible' })).status, 200);
    const visible = await (await request(endpoint)).json(); assert.equal(visible.length, 1);
    assert.equal((await request(endpoint, owner.insertId, 'POST', { content: 'reply', parent_id: visible[0].id, reply_to_user_id: reader.insertId })).status, 200);
    assert.equal((await request(`/comments/post/${post.insertId}`, owner.insertId, 'POST', { content: 'cross-target', parent_id: visible[0].id })).status, 404);
    assert.deepEqual(await (await request(`/comments/post/${post.insertId}`)).json(), []);
    assert.equal((await request(`/comments/${visible[0].id}/like`, reader.insertId, 'POST')).status, 200);
    const adminRows = await (await request('/admin/comments', owner.insertId)).json();
    assert.ok(adminRows.some(c => c.id === visible[0].id && c.update_id === note.insertId));
    await db.query("UPDATE updates SET status='draft' WHERE id=?", [note.insertId]);
    assert.equal((await request(endpoint)).status, 404);
    assert.equal((await request(`/comments/${visible[0].id}/like`, reader.insertId, 'POST')).status, 404);
  });

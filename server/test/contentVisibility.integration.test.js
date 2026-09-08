const test = require('node:test');
const assert = require('node:assert/strict');
test('draft comments are private; ordinary users cannot mutate other authors posts or shared media',
  { skip: process.env.CONTENT_INTEGRATION !== 'true' }, async t => {
    assert.match(process.env.DB_NAME || '', /^mooncci_qa(?:_|$)/);
    const db = require('../src/db'), platform = require('../src/platformDb');
    const app = require('../src/index'), jwt = require('jsonwebtoken');
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const unique = Date.now();
    const [writer] = await db.query("INSERT INTO users (username,email,password_hash,role,status) VALUES (?,?,'fixture','editor','active')", ['writer'+unique, `writer${unique}@example.test`]);
    const [other] = await db.query("INSERT INTO users (username,email,password_hash,role,status) VALUES (?,?,'fixture','editor','active')", ['other'+unique, `other${unique}@example.test`]);
    const [post] = await db.query("INSERT INTO posts (title,slug,content,status,author_id) VALUES ('draft',?,'secret','draft',?)", ['audit-'+unique, writer.insertId]);
    const [comment] = await db.query("INSERT INTO comments (post_id,user_id,content,status) VALUES (?,?,'private draft comment','visible')", [post.insertId, writer.insertId]);
    t.after(async () => { await new Promise(resolve => server.close(resolve)); await db.query('DELETE FROM posts WHERE id=?', [post.insertId]); await db.query('DELETE FROM users WHERE id IN (?,?)', [writer.insertId, other.insertId]); await db.end(); await platform.end(); });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const request = (path, id, method = 'GET', body) => fetch(base + path, { method, headers: {
      'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest',
      ...(id ? { Cookie: `mooncci_token=${jwt.sign({ id }, process.env.JWT_SECRET)}` } : {}),
    }, body: body ? JSON.stringify(body) : undefined });
    assert.equal((await request(`/comments/post/${post.insertId}`)).status, 404);
    assert.equal((await request(`/comments/post/${post.insertId}`, other.insertId)).status, 404);
    const own = await request(`/comments/post/${post.insertId}`, writer.insertId);
    assert.equal(own.status, 200);
    assert.match(own.headers.get('cache-control'), /private, no-store/);
    assert.equal((await request(`/comments/post/${post.insertId}`, other.insertId, 'POST', { content: 'should not create' })).status, 404);
    assert.equal((await request(`/comments/${comment.insertId}/like`, other.insertId, 'POST')).status, 404);
    assert.equal((await request(`/posts/${post.insertId}`, other.insertId, 'DELETE')).status, 403);
    assert.equal((await request('/upload/media/any.png', other.insertId, 'DELETE')).status, 403);
    await db.query("UPDATE posts SET status='published' WHERE id=?", [post.insertId]);
    assert.equal((await request(`/comments/post/${post.insertId}`)).status, 200);
  });

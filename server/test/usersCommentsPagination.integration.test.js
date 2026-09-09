const test = require('node:test');
const assert = require('node:assert/strict');
test('user/comment pagination reaches old records, filters targets and preserves owner/IP protection',
  { skip: process.env.CONTENT_INTEGRATION !== 'true' }, async t => {
    assert.match(process.env.DB_NAME || '', /^mooncci_qa(?:_|$)/);
    const db = require('../src/db'), express = require('express'), jwt = require('jsonwebtoken');
    const prefix = `lists-${Date.now()}`, ids = [];
    let postId, updateId;
    const app = express(); app.use(express.json()); app.use('/admin', require('../src/routes/admin'));
    const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
    t.after(async () => {
      await new Promise(r => server.close(r));
      if (postId) await db.query('DELETE FROM posts WHERE id=?', [postId]);
      if (updateId) await db.query('DELETE FROM updates WHERE id=?', [updateId]);
      if (ids.length) await db.query('DELETE FROM users WHERE id IN (?)', [ids]);
      await db.end(); await require('../src/platformDb').end();
    });
    for (let i = 0; i < 55; i++) {
      const role = ['owner', 'admin', 'editor', 'owner'][i] || 'user';
      const [row] = await db.query("INSERT INTO users(username,email,password_hash,role,status) VALUES (?,?,'fixture',?,'active')", [`${prefix}-${i}`, `${prefix}-${i}@example.test`, role]); ids.push(row.insertId);
    }
    const [post] = await db.query("INSERT INTO posts(title,slug,content,status,author_id) VALUES (?,?,'fixture','published',?)", [prefix, prefix, ids[0]]); postId = post.insertId;
    const [note] = await db.query("INSERT INTO updates(content,status,author_id) VALUES (?,'published',?)", [prefix, ids[0]]); updateId = note.insertId;
    const values = Array.from({ length: 351 }, (_, i) => [i % 2 ? postId : null, i % 2 ? null : updateId, ids[4], `${prefix}-comment-${i}`, 'pending', '203.0.113.42']);
    await db.query('INSERT INTO comments(post_id,update_id,user_id,content,status,ip_address) VALUES ?', [values]);
    const request = (url, id = ids[0], method = 'GET') => fetch(`http://127.0.0.1:${server.address().port}/admin${url}`, { method, headers: { Cookie: `mooncci_token=${jwt.sign({ id }, process.env.JWT_SECRET)}`, 'X-Requested-With': 'XMLHttpRequest' } });
    assert.equal((await request('/users?page=1', ids[2])).status, 403);
    assert.equal((await request('/comments?page=1', ids[4])).status, 403);
    const users = await (await request(`/users?page=2&keyword=${prefix}`)).json();
    assert.equal(users.total, 55); assert.equal(users.items.length, 5); assert.ok(users.items.every(u => !('password_hash' in u)));
    const owners = await (await request(`/users?page=1&keyword=${prefix}&role=owner&status=active`)).json(); assert.equal(owners.total, 2);
    assert.equal((await request(`/users/${ids[3]}`, ids[1], 'DELETE')).status, 403);
    assert.equal((await request(`/users/${ids[4]}`, ids[0], 'DELETE')).status, 200);
    const disabled = await (await request(`/users?page=1&keyword=${prefix}&status=disabled`)).json(); assert.equal(disabled.total, 1);
    const all = await (await request(`/comments?page=1&status=all&keyword=${prefix}`)).json();
    const last = await (await request(`/comments?page=99&status=all&keyword=${prefix}`)).json();
    assert.equal(all.total, 351); assert.equal(last.page, 8); assert.equal(last.items.length, 1);
    assert.ok(!all.items.some(a => a.id === last.items[0].id));
    const notes = await (await request(`/comments?page=1&target=update&keyword=${prefix}`, ids[1])).json();
    assert.equal(notes.total, 176); assert.ok(notes.items.every(c => c.update_id === updateId && c.ip_address === undefined && c.ip_address_masked));
    const posts = await (await request(`/comments?page=1&target=post&keyword=${prefix}`)).json(); assert.equal(posts.total, 175);
    assert.equal(all.items[0].ip_address, '203.0.113.42');
    await db.query("UPDATE comments SET status='visible' WHERE id=?", [last.items[0].id]);
    const clamped = await (await request(`/comments?page=8&status=pending&keyword=${prefix}`)).json(); assert.equal(clamped.page, 7);
    assert.ok(Array.isArray(await (await request('/comments?status=all')).json()));
    assert.ok(Array.isArray(await (await request('/users')).json()));
  });

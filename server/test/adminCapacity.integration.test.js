const test = require('node:test');
const assert = require('node:assert/strict');
test('paged media searches beyond 500; post pages omit bodies and retain editor isolation',
  { skip: process.env.CONTENT_INTEGRATION !== 'true' }, async t => {
    assert.match(process.env.DB_NAME || '', /^mooncci_qa(?:_|$)/);
    const db = require('../src/db');
    const express = require('express'), jwt = require('jsonwebtoken');
    const app = express();
    app.use('/admin', require('../src/routes/admin'));
    app.use('/upload', require('../src/routes/upload').router);
    app.use((e, _q, r, _n) => r.status(500).json({ message: e.message }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise(r => server.once('listening', r));
    const prefix = `capacity-${Date.now()}`;
    const ids = [];
    t.after(async () => {
      await new Promise(r => server.close(r));
      await db.query('DELETE FROM media_assets WHERE filename LIKE ?', [`${prefix}%`]);
      for (const id of ids) {
        await db.query('DELETE FROM posts WHERE author_id=?', [id]);
        await db.query('DELETE FROM users WHERE id=?', [id]);
      }
      await db.end(); await require('../src/platformDb').end();
    });
    for (const role of ['owner', 'editor', 'user']) {
      const [row] = await db.query("INSERT INTO users(username,email,password_hash,role,status) VALUES (?,?,'fixture',?,'active')", [`${prefix}-${role}`, `${prefix}-${role}@example.test`, role]);
      ids.push(row.insertId);
    }
    for (let i = 0; i < 125; i++) {
      await db.query("INSERT INTO posts(title,slug,content,status,author_id) VALUES (?, ?, ?, 'draft', ?)", [prefix, `${prefix}-${i}`, 'x'.repeat(20000), i === 124 ? ids[0] : ids[1]]);
    }
    const media = Array.from({ length: 1001 }, (_, i) => [`${prefix}-${i}.png`, `/api/uploads/${prefix}-${i}.png`, i === 0 ? `${prefix}-needle` : prefix]);
    await db.query('INSERT INTO media_assets(filename,url,original_name) VALUES ?', [media]);
    const get = (path, id = ids[0]) => fetch(`http://127.0.0.1:${server.address().port}${path}`, { headers: id ? { Cookie: `mooncci_token=${jwt.sign({ id }, process.env.JWT_SECRET)}` } : {} });
    assert.equal((await get('/upload/media?page=1', null)).status, 401);
    assert.equal((await get('/admin/stats', ids[2])).status, 403);
    const first = await (await get(`/upload/media?page=1&q=${prefix}`)).json();
    const second = await (await get(`/upload/media?page=2&q=${prefix}`)).json();
    assert.equal(first.total, 1001); assert.equal(first.items.length, 50);
    assert.ok(second.items.every(row => !first.items.some(other => other.id === row.id)));
    const found = await (await get(`/upload/media?page=1&q=${prefix}-needle`)).json();
    assert.equal(found.total, 1); assert.equal(found.items[0].filename, `${prefix}-0.png`);
    const last = await (await get(`/upload/media?page=99999&q=${prefix}`)).json();
    assert.equal(last.page, 21); assert.equal(last.items.length, 1);
    assert.ok(Array.isArray(await (await get('/upload/media')).json()), 'old deployed clients still receive an array');
    const posts = await (await get('/admin/posts?page=1', ids[1])).json();
    assert.equal(posts.total, 124); assert.equal(posts.items.length, 50);
    assert.ok(posts.items.every(p => p.author_id === ids[1] && !('content' in p)));
    assert.deepEqual(await (await get('/admin/stats', ids[1])).json(), { posts: 124, users: 0, comments: 0, bannedWords: 0 });
    const [[count]] = await db.query('SELECT COUNT(*) AS total FROM posts');
    assert.equal((await (await get('/admin/stats')).json()).posts, Number(count.total));
    t.diagnostic(`124 synthetic articles at 20 KB/body: new first page JSON ${Buffer.byteLength(JSON.stringify(posts))} bytes; old bodies alone 2,480,000 bytes.`);
  });


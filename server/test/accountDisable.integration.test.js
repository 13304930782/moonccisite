const test = require('node:test');
const assert = require('node:assert/strict');

test('disabling invalidates sessions permanently, writes atomically, and rejects a stale disable after promotion',
  { skip: process.env.CONTENT_INTEGRATION !== 'true' }, async t => {
    assert.match(process.env.DB_NAME || '', /^mooncci_qa(?:_|$)/);
    const db = require('../src/db'), express = require('express'), jwt = require('jsonwebtoken');
    const prefix = `disable-${Date.now()}`, ids = [];
    const app = express(); app.use(express.json());
    app.use('/admin', require('../src/routes/admin'));
    app.get('/me', require('../src/middleware/auth').authRequired, (req, res) => res.json(req.user));
    app.use((error, req, res, next) => res.status(500).json({ message: 'test database failure' }));
    const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
    t.after(async () => {
      t.mock.restoreAll();
      await new Promise(r => server.close(r));
      if (ids.length) {
        await db.query('DELETE FROM auth_invalidations WHERE user_id IN (?)', [ids]);
        await db.query('DELETE FROM users WHERE id IN (?)', [ids]);
      }
      await db.end(); await require('../src/platformDb').end();
    });
    for (const [i, role] of ['owner', 'admin', 'user'].entries()) {
      const [row] = await db.query("INSERT INTO users(username,email,password_hash,role,status) VALUES (?,?,'fixture',?,'active')", [`${prefix}-${i}`, `${prefix}-${i}@example.test`, role]);
      ids.push(row.insertId);
    }
    const token = id => jwt.sign({ id, sessionStartedAt: Date.now() }, process.env.JWT_SECRET);
    const actor = token(ids[0]), manager = token(ids[1]);
    const request = (path, cookie = actor, method = 'GET', body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { Cookie: `mooncci_token=${cookie}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    for (const method of ['PUT', 'DELETE']) {
      const oldToken = token(ids[2]);
      assert.equal((await request('/me', oldToken)).status, 200);
      assert.equal((await request(`/admin/users/${ids[2]}`, actor, method, method === 'PUT' ? { status: 'disabled' } : undefined)).status, 200);
      assert.ok([401, 403].includes((await request('/me', oldToken)).status));
      assert.equal((await request(`/admin/users/${ids[2]}`, actor, 'PUT', { status: 'active' })).status, 200);
      assert.equal((await request('/me', oldToken)).status, 401, 'reactivation must not revive the previous session');
      // Avoid issuing a new session within the invalidation millisecond itself.
      await new Promise(r => setTimeout(r, 5));
      assert.equal((await request('/me', token(ids[2]))).status, 200);
    }
    // Role checks already reload the database: the same token must lose admin access.
    const roleToken = token(ids[2]);
    assert.equal((await request(`/admin/users/${ids[2]}`, actor, 'PUT', { role: 'admin' })).status, 200);
    assert.equal((await request('/admin/users?page=1', roleToken)).status, 200);
    assert.equal((await request(`/admin/users/${ids[2]}`, actor, 'PUT', { role: 'user' })).status, 200);
    assert.equal((await request('/admin/users?page=1', roleToken)).status, 403);

    const getConnection = db.getConnection.bind(db);
    const connectionMock = t.mock.method(db, 'getConnection', async () => {
      const connection = await getConnection(), query = connection.query.bind(connection);
      connection.query = async (sql, args) => {
        if (sql.startsWith('INSERT INTO auth_invalidations')) throw Error('injected invalidation write failure');
        return query(sql, args);
      };
      const release = connection.release.bind(connection);
      connection.release = () => { connection.query = query; connection.release = release; release(); };
      return connection;
    });
    for (const method of ['PUT', 'DELETE']) {
      assert.equal((await request(`/admin/users/${ids[2]}`, actor, method, method === 'PUT' ? { status: 'disabled' } : undefined)).status, 500);
      const [[row]] = await db.query('SELECT status FROM users WHERE id=?', [ids[2]]);
      assert.equal(row.status, 'active', 'failed revocation must roll back the status write');
    }
    connectionMock.mock.restore();
    // Promote the target after DELETE reads it; a stale admin request cannot disable an owner.
    const query = db.query.bind(db);
    let promoted = false;
    t.mock.method(db, 'query', async (sql, args) => {
      const result = await query(sql, args);
      if (!promoted && sql.startsWith('SELECT id, role, status FROM users') && Number(args[0]) === ids[2]) {
        promoted = true;
        await query("UPDATE users SET role='owner' WHERE id=?", [ids[2]]);
      }
      return result;
    });
    assert.equal((await request(`/admin/users/${ids[2]}`, manager, 'DELETE')).status, 409);
    const [[row]] = await query('SELECT role,status FROM users WHERE id=?', [ids[2]]);
    assert.equal(row.role, 'owner'); assert.equal(row.status, 'active');

    for (const method of ['PUT', 'DELETE']) {
      await query("UPDATE users SET role='owner',status='active' WHERE id IN (?)", [[ids[0], ids[2]]]);
      await query('DELETE FROM auth_invalidations WHERE user_id IN (?)', [[ids[0], ids[2]]]);
      const tokens = [token(ids[0]), token(ids[2])];
      const results = await Promise.all([
        request(`/admin/users/${ids[2]}`, tokens[0], method, method === 'PUT' ? { role: 'user' } : undefined),
        request(`/admin/users/${ids[0]}`, tokens[1], method, method === 'PUT' ? { role: 'user' } : undefined),
      ]);
      assert.equal(results.filter(result => result.status === 200).length, 1);
      assert.ok(results.every(result => [200, 401, 403].includes(result.status)));
      const [[remaining]] = await query("SELECT COUNT(*) AS count FROM users WHERE id IN (?) AND role='owner' AND status='active'", [[ids[0], ids[2]]]);
      assert.equal(Number(remaining.count), 1, 'concurrent owner changes must leave an active owner');
    }
  });

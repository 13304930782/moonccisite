const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

test('service tokens are scoped, revoked and audited without changing JWT access', async t => {
  process.env.JWT_SECRET = 'service-token-test-secret-not-for-production';
  process.env.ENGAGEMENT_ENABLED = 'false';
  process.env.PUBLISHING_ENABLED = 'true';
  const db = require('../src/db');
  const jwt = require('jsonwebtoken');
  const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
  const token = 'mst_' + 'a'.repeat(43);
  const record = {id: 17, name: 'test-bot', token_hash: sha256(token), scopes: JSON.stringify(['comments:read', 'comments:moderate', 'publishing:read']), revoked_at: null};
  const owner = {id: 1, username: 'owner', role: 'owner', status: 'active', can_comment: 1};
  const admin = {id: 2, username: 'admin', role: 'admin', status: 'active', can_comment: 1};
  const comment = {id: 9, post_id: 1, user_id: 2, status: 'pending', content: 'test', author_name: 'reader', author_email: '', post_title: 'test'};
  const audit = [];
  let created, failAudit = false;
  async function query(sql, args = []) {
    if (/INSERT INTO service_tokens/i.test(sql)) {
      created = {id: 18, name: args[0], token_hash: args[1], scopes: args[2], revoked_at: null};
      return [{insertId: 18}];
    }
    if (/FROM service_tokens/i.test(sql)) {
      if (/WHERE token_hash/i.test(sql)) return [[...([record, created].filter(r => r && args.includes(r.token_hash)))]];
      return [[...([record, created].filter(Boolean).map(({token_hash, ...row}) => row))]];
    }
    if (/UPDATE service_tokens SET revoked_at/i.test(sql)) { if (created && Number(args[0]) === created.id) { created.revoked_at = '2026-11-09'; return [{affectedRows: 1}]; } return [{affectedRows: 0}]; }
    if (/UPDATE service_tokens/i.test(sql)) return [{affectedRows: 1}];
    if (/FROM users/i.test(sql)) return [[...([owner, admin].filter(user => user.id === Number(args[0])))]];
    if (/FROM comments c/i.test(sql)) return [[{...comment}]];
    if (/UPDATE comments SET status/i.test(sql)) {
      if (comment.status !== args[2]) return [{affectedRows: 0}];
      comment.status = args[0]; return [{affectedRows: 1}];
    }
    if (/INSERT INTO service_audit/i.test(sql)) { if (failAudit) throw Error('audit unavailable'); audit.push([...args]); return [{affectedRows: 1}]; }
    if (/FROM article_workflows/i.test(sql)) return [[...(sql.includes('COUNT(') ? [{total: 0}] : [])]];
    if (/FROM site_settings/i.test(sql)) return [[]];
    throw Error('Unexpected SQL: ' + sql);
  }
  t.mock.method(db, 'query', async (...args) => structuredClone(await query(...args)));
  t.mock.method(db, 'getConnection', async () => {
    let previous;
    return {beginTransaction: async () => { previous = comment.status; }, query: async (...args) => structuredClone(await query(...args)),
      commit: async () => {}, rollback: async () => { comment.status = previous; }, release: () => {}};
  });
  t.mock.method(require('../src/lib/runtimeStatus'), 'runtimeStatus', async () => ({ok: true}));
  const app = require('../src/index');
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await db.end(); await require('../src/platformDb').end(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function request(path, {service, user = false, method = 'GET', body} = {}) {
    const headers = {'Content-Type': 'application/json'};
    if (service !== undefined) headers['X-Service-Token'] = service;
    if (user) headers.Authorization = 'Bearer ' + jwt.sign({id: user === 'admin' ? 2 : 1}, process.env.JWT_SECRET);
    if (user && !service) headers['X-Requested-With'] = 'XMLHttpRequest';
    const res = await fetch(base + path, {method, headers, ...(body ? {body: JSON.stringify(body)} : {})});
    return {status: res.status, body: await res.json()};
  }
  assert.equal((await request('/admin/comments?status=pending')).status, 401);
  assert.equal((await request('/admin/comments?status=pending', {service: 'wrong', user: true})).status, 401);
  assert.equal((await request('/article-drafts', {service: 'wrong', user: true})).status, 401);
  assert.equal((await request('/article-drafts', {service: token, user: true})).status, 403);
  record.revoked_at = '2026-11-09';
  assert.equal((await request('/admin/comments?status=pending', {service: token})).status, 401);
  record.revoked_at = null;
  assert.equal((await request('/admin/runtime', {service: token})).status, 403);
  record.scopes = JSON.stringify(['comments:read', 'comments:moderate', 'publishing:read', 'runtime:read']);
  assert.equal((await request('/admin/runtime', {service: token})).status, 200);
  assert.equal((await request('/admin/banned-words', {service: token})).status, 403);
  assert.equal((await request('/admin/users', {service: token})).status, 403);
  assert.equal((await request('/admin/editor-applications', {service: token})).status, 403);
  assert.equal((await request('/admin/electricity/rooms', {service: token})).status, 403);
  assert.equal((await request('/admin/operations', {service: token})).status, 403);
  assert.equal((await request('/admin/service-tokens', {service: token})).status, 403);
  assert.equal((await request('/publishing/42/approve', {service: token, method: 'POST'})).status, 403);
  assert.equal((await request('/publishing/queue?state=submitted', {service: token})).status, 200);
  process.env.PUBLISHING_ENABLED = 'false';
  assert.equal((await request('/publishing/queue?state=submitted', {service: token})).status, 404);
  process.env.PUBLISHING_ENABLED = 'true';
  const list = await request('/admin/comments?status=pending', {service: token});
  assert.equal(list.status, 200);
  assert.equal(list.body[0].status, 'pending');
  assert.equal((await request('/admin/comments?status=all', {service: token})).status, 403);
  assert.equal((await request('/admin/comments/9', {service: token, method: 'PUT', body: {status: 'deleted'}})).status, 403);
  assert.equal(audit.length, 0);
  assert.equal((await request('/admin/comments/9', {service: token, method: 'PUT', body: {status: 'rejected'}})).status, 200);
  assert.equal(comment.status, 'rejected');
  assert.equal(audit.length, 1);
  assert.equal((await request('/admin/comments/9', {service: token, method: 'PUT', body: {status: 'visible'}})).status, 403);
  assert.equal(audit.length, 1);
  comment.status = 'pending';
  assert.equal((await request('/admin/comments/9', {service: token, method: 'PUT', body: {status: 'visible'}})).status, 200);
  assert.equal(comment.status, 'visible');
  assert.equal(audit.length, 2);
  comment.status = 'pending'; failAudit = true;
  assert.equal((await request('/admin/comments/9', {service: token, method: 'PUT', body: {status: 'rejected'}})).status, 500);
  assert.equal(comment.status, 'pending');
  assert.equal(audit.length, 2);
  failAudit = false;
  assert.equal((await request('/admin/comments?status=pending', {user: true})).status, 200);
  assert.equal((await request('/admin/service-tokens', {user: 'admin'})).status, 403);
  assert.equal((await request('/admin/service-tokens', {user: true, method: 'POST', body: {name: 'bot', scopes: ['users:write']}})).status, 400);
  const issued = await request('/admin/service-tokens', {user: true, method: 'POST', body: {name: 'bot', scopes: ['comments:read']}});
  assert.equal(issued.status, 201);
  assert.match(issued.body.token, /^mst_[A-Za-z0-9_-]{43}$/);
  assert.equal(created.token_hash, sha256(issued.body.token));
  const listed = await request('/admin/service-tokens', {user: true});
  assert.equal(listed.status, 200);
  assert.doesNotMatch(JSON.stringify(listed.body), /token_hash|mst_/);
  assert.equal((await request('/admin/service-tokens/18/revoke', {user: true, method: 'POST'})).status, 200);
  assert.equal((await request('/admin/comments?status=pending', {service: issued.body.token})).status, 401);
});

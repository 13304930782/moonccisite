const test = require('node:test');
const assert = require('node:assert/strict');
test(
  'production CSRF, stable publishing, public project visibility and exclusive worker lease',
  { skip: process.env.CONTENT_INTEGRATION !== 'true' },
  async () => {
    assert.match(process.env.DB_NAME || '', /^mooncci_qa(?:_|$)/);
    process.env.CSRF_TRUSTED_ORIGINS = 'https://qa.mooncci.invalid';
    process.env.SITE_URL = 'https://qa.mooncci.invalid';
    process.env.NEWSLETTER_DELIVERY_ENABLED = 'false';
    const db = require('../src/platformDb'),
      legacy = require('../src/db');
    const app = require('../src/index'),
      jwt = require('jsonwebtoken');
    const server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const cookie = `mooncci_token=${jwt.sign({ id: 1 }, process.env.JWT_SECRET)}`;
    const headers = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      Origin: 'https://qa.mooncci.invalid',
      Cookie: cookie,
    };
    const request = (path, method = 'GET', body, extra = {}) =>
      fetch(base + path, {
        method,
        headers: { ...headers, ...extra },
        body: body ? JSON.stringify(body) : undefined,
      });
    let pid, postId, lease;
    const postSlug = 'publish-qa-' + Date.now();
    try {
      await db.query(
        "INSERT INTO users (id,username,email,password_hash,role,status,can_comment) VALUES (1,'QA owner','qa@example.invalid','test-only','owner','active',1) ON DUPLICATE KEY UPDATE role='owner',status='active'",
      );
      assert.equal(
        (
          await request(
            '/admin/updates',
            'POST',
            { content: 'blocked', status: 'draft' },
            { 'X-Requested-With': '' },
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request(
            '/admin/updates',
            'POST',
            { content: 'blocked', status: 'draft' },
            { Origin: 'https://untrusted.invalid' },
          )
        ).status,
        403,
      );
      assert.equal(
        (await request('/admin/updates', 'POST', { content: 'allowed QA', status: 'draft' }))
          .status,
        201,
      );
      const created = await request('/posts', 'POST', {
        title: 'Publish boundary QA',
        slug: postSlug,
        content: '## Section\nQA content',
        summary: 'QA',
        status: 'published',
        tags: [],
      });
      assert.ok(created.ok, await created.clone().text());
      postId = (await created.json()).id;
      const original = (await (await request('/posts/' + postId)).json()).published_at;
      await request('/posts/' + postId, 'PUT', {
        title: 'Publish boundary QA',
        slug: postSlug,
        content: 'Edited QA',
        status: 'draft',
        tags: [],
      });
      assert.equal(
        (await request('/posts/' + postId, 'GET', null, { Cookie: '' })).status,
        404,
      );
      await request('/posts/' + postId, 'PUT', {
        title: 'Publish boundary QA',
        slug: postSlug,
        content: 'Republished QA',
        status: 'published',
        tags: [],
      });
      assert.equal((await (await request('/posts/' + postId)).json()).published_at, original);
      const [p] = await db.query(
        "INSERT INTO projects (slug,name,summary,content,tech_stack,stage,status,repo) VALUES (?,'Visibility QA','QA','QA','','active','published','qa/repo')",
        ['visibility-' + Date.now()],
      );
      pid = p.insertId;
      const [r] = await db.query(
        "INSERT INTO project_releases (project_id,repo,github_id,title,content,url,published_at,historical) VALUES (?,'qa/repo',999,'Visibility release','QA','https://github.com/qa/repo/releases/tag/v1',UTC_TIMESTAMP(),0)",
        [pid],
      );
      const activity = await (await request('/activity')).json();
      assert.ok(activity.items.some((x) => x.activity_id === `release-${r.insertId}`));
      const home = await (await request('/activity?scope=home')).json();
      assert.ok(home.items.every((x) => x.type !== 'post'));
      let rss = await (await request('/feed.xml')).text();
      assert.ok(rss.includes(`urn:mooncci:release:${r.insertId}`));
      await db.query("UPDATE projects SET status='draft' WHERE id=?", [pid]);
      assert.ok(
        !(await (await request('/activity')).json()).items.some(
          (x) => x.activity_id === `release-${r.insertId}`,
        ),
      );
      rss = await (await request('/feed.xml')).text();
      assert.ok(!rss.includes(`urn:mooncci:release:${r.insertId}`));
      assert.equal(
        (
          await request(
            '/projects/' +
              (await db.query('SELECT slug FROM projects WHERE id=?', [pid]))[0][0].slug,
          )
        ).status,
        404,
      );
      const { acquireWorkerLease, releaseWorkerLease } = require('../src/jobs/workerLease');
      lease = await acquireWorkerLease();
      assert.ok(lease);
      assert.equal(await acquireWorkerLease(), null);
      await releaseWorkerLease(lease);
      lease = null;
      lease = await acquireWorkerLease();
      assert.ok(lease);
      await releaseWorkerLease(lease);
      lease = null;
    } finally {
      if (lease) await require('../src/jobs/workerLease').releaseWorkerLease(lease);
      if (postId) await db.query("UPDATE posts SET status='draft' WHERE id=?", [postId]);
      if (pid) await db.query("UPDATE projects SET status='draft' WHERE id=?", [pid]);
      await new Promise((resolve) => server.close(resolve));
      await db.end();
      await legacy.end();
    }
  },
);

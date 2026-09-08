const test = require('node:test'),
  assert = require('node:assert/strict');
test(
  'GitHub missing pages are reconciled by release ID; failures never imply deletion',
  { skip: process.env.CONTENT_INTEGRATION !== 'true' },
  async () => {
    assert.match(process.env.DB_NAME || '', /^mooncci_qa(?:_|$)/);
    process.env.GITHUB_SYNC_ENABLED = 'true';
    const db = require('../src/platformDb'),
      legacy = require('../src/db'),
      { syncProject } = require('../src/services/githubSync');
    const originalFetch = global.fetch;
    let pid,
      mode = 'initial';
    const record = (id) => ({
      id,
      name: `v${id}`,
      body: 'QA',
      draft: false,
      prerelease: false,
      published_at: '2026-09-01T00:00:00Z',
      html_url: `https://github.com/qa/repo/releases/tag/v${id}`,
    });
    global.fetch = async (url) => {
      if (String(url).endsWith('/repos/qa/repo')) return Response.json({ private: false });
      if (String(url).includes('/releases?')) {
        if (mode === 'page-failure') {
          if (String(url).includes('page=2')) throw Error('Simulated connection loss');
          return Response.json(Array.from({ length: 100 }, (_, i) => record(i + 1)));
        }
        return Response.json(mode === 'initial' ? [record(1), record(2)] : [record(2)]);
      }
      if (String(url).endsWith('/releases/1')) {
        if (mode === 'deleted') return new Response('{}', { status: 404 });
        if (mode === 'request-failure') return new Response('{}', { status: 503 });
        return Response.json({ ...record(1), prerelease: mode === 'prerelease' });
      }
      throw Error('Unexpected QA request ' + url);
    };
    try {
      const [p] = await db.query(
        "INSERT INTO projects (slug,name,summary,content,tech_stack,status,stage,repo,sync_enabled) VALUES (?,'GitHub QA','QA','QA','','draft','active','qa/repo',1)",
        ['github-contract-' + Date.now()],
      );
      pid = p.insertId;
      const run = async () => {
        await db.query(
          'UPDATE github_sync_state SET next_attempt_at=NULL,etag=NULL WHERE project_id=?',
          [pid],
        );
        return syncProject(pid);
      };
      await run();
      const visible = async () =>
        Number(
          (
            await db.query(
              'SELECT source_visible FROM project_releases WHERE project_id=? AND github_id=1',
              [pid],
            )
          )[0][0].source_visible,
        );
      mode = 'missing-list';
      await run();
      assert.equal(await visible(), 1, 'missing list row with valid detail stays visible');
      mode = 'request-failure';
      await assert.rejects(run());
      assert.equal(await visible(), 1);
      mode = 'page-failure';
      await assert.rejects(run());
      assert.equal(await visible(), 1, 'incomplete pagination preserves existing records');
      mode = 'prerelease';
      await run();
      assert.equal(await visible(), 0);
      await db.query(
        'UPDATE project_releases SET hidden=1 WHERE project_id=? AND github_id=1',
        [pid],
      );
      mode = 'missing-list';
      await run();
      assert.equal(await visible(), 1);
      assert.equal(
        (
          await db.query(
            'SELECT hidden FROM project_releases WHERE project_id=? AND github_id=1',
            [pid],
          )
        )[0][0].hidden,
        1,
      );
      mode = 'deleted';
      await run();
      assert.equal(await visible(), 0, 'only confirmed release detail 404 withdraws it');
    } finally {
      global.fetch = originalFetch;
      await db.end();
      await legacy.end();
    }
  },
);

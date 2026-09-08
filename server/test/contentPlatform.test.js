const test = require('node:test');
const assert = require('node:assert/strict');
const {
  updateInput,
  projectInput,
  webUrl,
  repoName,
  hash,
  token,
  emailAddress,
  previousWeek,
  xml,
  releaseRecords,
  definiteMailFailure,
} = require('../src/lib/contentPlatform');
test('content validation excludes unsafe image URLs and empty published updates', () => {
  for (const url of [
    'javascript:alert(1)',
    'data:image/svg+xml,x',
    '//evil.test/a',
    '/api/uploads/../secret',
    'https://user:pass@example.test/a',
  ])
    assert.throws(() => webUrl(url, true));
  assert.equal(webUrl('/api/uploads/picture.webp', true), '/api/uploads/picture.webp');
  assert.throws(() => updateInput({ content: ' ', status: 'published' }));
  assert.throws(() => updateInput({ content: 'ok', status: 'hidden' }));
  assert.equal(updateInput({ content: ' note ', status: 'draft' }).content, 'note');
});
test('projects constrain repository host, slug, status and recommendation order', () => {
  assert.equal(repoName('owner/repository'), 'owner/repository');
  for (const repo of ['https://evil.test/a', 'owner/repo/../private', 'owner/repo?token=x'])
    assert.throws(() => repoName(repo));
  const base = {
    slug: 'test-project',
    name: 'Test',
    summary: 'Summary',
    status: 'draft',
    stage: 'building',
  };
  assert.equal(projectInput(base).featured_rank, null);
  assert.equal(projectInput({ ...base, featured_rank: '2' }).featured_rank, 2);
  assert.throws(() => projectInput({ ...base, featured_rank: -1 }));
  assert.throws(() => projectInput({ ...base, slug: '../secret' }));
});
test('Shanghai weekly window does not send before Monday 09:00 and crosses years correctly', () => {
  const before = previousWeek(new Date('2026-09-07T00:59:59Z')),
    after = previousWeek(new Date('2026-09-07T01:00:00Z'));
  assert.equal(before.due, false);
  assert.equal(after.due, true);
  assert.equal(after.key, '2026-08-31');
  assert.equal(after.start, '2026-08-30 16:00:00');
  assert.equal(after.end, '2026-09-06 16:00:00');
  assert.equal(previousWeek(new Date('2026-01-05T01:00:00Z')).key, '2025-12-29');
});
test('release ingestion accepts only public formal releases with stable numeric identities', () => {
  const base = {
    id: 7,
    name: 'v1.0',
    body: 'Notes',
    published_at: '2026-09-05T01:00:00Z',
    html_url: 'https://github.com/owner/repo/releases/tag/v1',
  };
  const records = releaseRecords(
    [
      base,
      { ...base, id: 8, prerelease: true },
      { ...base, id: 9, draft: true },
      { ...base, id: 10, html_url: 'javascript:alert(1)' },
    ],
    true,
  );
  assert.equal(records.length, 1);
  assert.equal(records[0].historical, 1);
  assert.equal(records[0].github_id, 7);
});
test('subscription tokens are random and stored through hashes; emails reject header injection', () => {
  const a = token(),
    b = token();
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.notEqual(a, b);
  assert.notEqual(hash(a), a);
  assert.equal(hash(a).length, 64);
  assert.equal(emailAddress(' USER@example.com '), 'user@example.com');
  assert.throws(() => emailAddress('a@example.com\r\nBcc:b@example.com'));
});
test('delivery retries only errors proving non-delivery, not ambiguous timeouts', () => {
  assert.equal(definiteMailFailure({ code: 'EAUTH' }), true);
  assert.equal(definiteMailFailure({ responseCode: 550 }), true);
  assert.equal(definiteMailFailure({ code: 'ETIMEDOUT', command: 'DATA' }), false);
  assert.equal(definiteMailFailure({ code: 'ECONNRESET' }), false);
});
test('RSS escapes markup and invalid XML control characters', () =>
  assert.equal(xml('<script>&\u0000'), '&lt;script&gt;&amp;'));

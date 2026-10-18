const test = require('node:test');
const assert = require('node:assert/strict');

function harness(t, options = {}) {
  const queries = [], sent = [], runs = [], exclusions = options.exclusions || [];
  const items = options.items || [{ id: 1, type: 'post', title: 'Included', excerpt: 'Summary', path: '/article/1' }];
  let reads = 0;
  async function query(sql, params = []) {
    queries.push({ sql, params });
    if (sql.includes('GET_LOCK')) return [[{ acquired: options.locked === false ? 0 : 1 }]];
    if (sql.includes('RELEASE_LOCK')) return [[{}]];
    if (sql.startsWith('SELECT started_at')) return [[options.started ? { started_at: new Date() } : undefined]];
    if (sql.startsWith('SELECT * FROM newsletter_runs')) return [options.runs || []];
    if (sql.startsWith('SELECT content_type')) return [exclusions];
    if (sql.startsWith('INSERT IGNORE INTO newsletter_exclusions')) {
      exclusions.push({ content_type: params[1], content_id: params[2] });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('DELETE FROM newsletter_exclusions')) {
      const index = exclusions.findIndex((item) => item.content_type === params[1] && item.content_id === params[2]);
      if (index >= 0) exclusions.splice(index, 1);
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('INSERT INTO newsletter_runs')) { runs.push(params); return [{}]; }
    if (sql.startsWith('SELECT enabled')) return [[{ enabled: options.enabled === false ? 0 : 1 }]];
    if (sql.startsWith('SELECT COUNT(*) total FROM subscribers')) return [[{ total: options.subscribers ?? 1 }]];
    if (sql.startsWith('SELECT d.id,d.subscriber_id')) return [[{ id: 1, subscriber_id: 1, email: 'qa@example.invalid' }]];
    if (sql.startsWith('SELECT status FROM subscribers')) return [[{ status: 'active' }]];
    if (sql.startsWith('SELECT status,COUNT(*)')) return [options.deliveryCounts || (sent.length ? [{ status: options.deliveryStatus || 'sent', total: 1 }] : [])];
    if (sql.startsWith('UPDATE newsletter_deliveries d JOIN')) return [{ affectedRows: 1 }];
    if (/^(UPDATE newsletter_runs|UPDATE newsletter_deliveries|DELETE FROM newsletter_tokens|INSERT IGNORE INTO newsletter_deliveries|INSERT INTO newsletter_tokens)/.test(sql)) return [{}];
    throw Error(`Unexpected query: ${sql}`);
  }
  let released = false;
  const db = { query, getConnection: async () => ({ query, release() { released = true; } }) };
  const overrides = {
    '../src/platformDb': db,
    '../src/repositories/activityRepository': { allActivity: async () => {
      reads++;
      if (options.activityError) throw Error('database unavailable');
      return typeof options.items === 'function' ? options.items(reads) : items;
    } },
    '../src/lib/mailer': { getMailConfig: async () => ({}), isMailEnabled: () => options.mail !== false,
      sendMail: async (mail) => { sent.push(mail); return { sent: true }; } },
  };
  const previous = new Map();
  for (const [name, exports] of Object.entries(overrides)) {
    const id = require.resolve(name); previous.set(id, require.cache[id]); require.cache[id] = { id, filename: id, loaded: true, exports };
  }
  const reviewPath = require.resolve('../src/services/newsletterReview');
  const servicePath = require.resolve('../src/services/newsletter');
  delete require.cache[reviewPath]; delete require.cache[servicePath];
  const env = process.env.NEWSLETTER_DELIVERY_ENABLED;
  process.env.NEWSLETTER_DELIVERY_ENABLED = options.envOff ? 'false' : 'true';
  t.after(() => {
    for (const [id, value] of previous) { if (value) require.cache[id] = value; else delete require.cache[id]; }
    delete require.cache[reviewPath]; delete require.cache[servicePath];
    if (env === undefined) delete process.env.NEWSLETTER_DELIVERY_ENABLED; else process.env.NEWSLETTER_DELIVERY_ENABLED = env;
  });
  return { ...require(reviewPath), ...require(servicePath), queries, sent, runs, get released() { return released; } };
}

test('next preview covers Sunday and Monday before09, then advances exactly at09 across years', (t) => {
  const { upcomingWeek } = harness(t);
  for (const now of ['2026-10-18T14:00:00Z', '2026-10-19T00:59:59Z']) {
    assert.deepEqual(upcomingWeek(new Date(now)), { key: '2026-10-12', start: '2026-10-11 16:00:00', end: '2026-10-18 16:00:00', scheduledAt: '2026-10-19T01:00:00.000Z' });
  }
  assert.equal(upcomingWeek(new Date('2026-10-19T01:00:00Z')).key, '2026-10-19');
  assert.equal(upcomingWeek(new Date('2026-01-04T23:00:00Z')).key, '2025-12-29');
});

test('selection is persistent, type-specific and reversible, and preview includes excluded rows', async (t) => {
  const h = harness(t, { items: [{ id: 1, type: 'post' }, { id: 1, type: 'update' }] });
  const now = new Date('2026-10-18T14:00:00Z');
  await h.selectItem({ weekStart: '2026-10-12', type: 'post', id: 1, included: false }, now);
  assert.deepEqual((await h.preview(now)).items.map((item) => item.included), [false, true]);
  await h.selectItem({ weekStart: '2026-10-12', type: 'post', id: 1, included: true }, now);
  assert.deepEqual((await h.preview(now)).items.map((item) => item.included), [true, true]);
  assert.ok(h.released);
});

test('selection rejects malformed ids, stale periods, removed content and releases lock on rejection', async (t) => {
  const h = harness(t), now = new Date('2026-10-18T14:00:00Z');
  const input = { weekStart: '2026-10-12', type: 'post', id: 1, included: false };
  await assert.rejects(h.selectItem({ ...input, id: '1' }, now), /格式/);
  await assert.rejects(h.selectItem({ ...input, weekStart: '2026-10-05' }, now), /刷新/);
  await assert.rejects(h.selectItem({ ...input, id: 99 }, now), /不在本期/);
  assert.ok(h.released);
  assert.ok(!h.queries.some(({ sql }) => sql.startsWith('INSERT IGNORE INTO newsletter_exclusions')));
});

test('sending lock prevents edits, frozen periods remain read-only', async (t) => {
  const h = harness(t, { started: true }), now = new Date('2026-10-18T14:00:00Z');
  assert.equal((await h.preview(now)).editable, false);
  await assert.rejects(h.selectItem({ weekStart: '2026-10-12', type: 'post', id: 1, included: false }, now), /不能再修改/);
});

test('concurrent sender lock returns conflict without mutation or releasing someone else lock', async (t) => {
  const h = harness(t, { locked: false });
  await assert.rejects(h.selectItem({ weekStart: '2026-10-12', type: 'post', id: 1, included: false }, new Date('2026-10-18T14:00:00Z')), /正在处理/);
  assert.ok(!h.queries.some(({ sql }) => sql.includes('RELEASE_LOCK')));
  assert.ok(h.released);
});

for (const [name, options, reason] of [
  ['environment off', { envOff: true }, '服务端投递未开启'],
  ['paused', { enabled: false }, '周报已暂停'],
  ['mail off', { mail: false }, '邮件通道未开启'],
  ['no content', { items: [] }, '本周无新内容'],
  ['all excluded', { exclusions: [{ content_type: 'post', content_id: 1 }] }, '本期内容全部取消发送'],
  ['no subscribers', { subscribers: 0 }, '无有效订阅'],
]) test(`due run persists brief reason: ${name}`, async (t) => {
  const h = harness(t, options);
  await h.deliverWeek(new Date('2026-10-19T01:01:00Z'));
  assert.deepEqual(h.runs[0], ['2026-10-12', 'skipped', reason, 0]);
  assert.equal(h.sent.length, 0);
  assert.ok(!h.queries.some(({ sql }) => sql.startsWith('INSERT IGNORE INTO newsletter_deliveries')));
});

test('before due does not invent a run; unknown weeks stay missing and Monday before09 excludes upcoming', async (t) => {
  const h = harness(t);
  await h.deliverWeek(new Date('2026-10-19T00:59:00Z'));
  assert.equal(h.queries.length, 0);
  const runs = await h.recentRuns(new Date('2026-10-19T00:59:00Z'));
  assert.equal(runs.length, 12);
  assert.equal(runs[0].week_start, '2026-10-05');
  assert.equal(runs[0].status, 'missing');
  assert.equal(runs[0].last_checked_at, null);
});

test('actual send and recipient requery both respect exclusions; completion is persisted', async (t) => {
  const h = harness(t, { items: (read) => [
    { id: 1, type: 'post', title: read === 1 ? 'Before' : 'Current content', path: '/article/1', excerpt: 'Summary' },
    { id: 2, type: 'post', title: 'Excluded content', path: '/article/2', excerpt: 'Do not send' },
  ], exclusions: [{ content_type: 'post', content_id: 2 }] });
  await h.deliverWeek(new Date('2026-10-19T01:01:00Z'));
  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0].text, /Current content/);
  assert.doesNotMatch(h.sent[0].text, /Excluded content|Before/);
  assert.deepEqual(h.runs.at(-1), ['2026-10-12', 'completed', '已发送 1 封', 1]);
});

test('later pause retains actual sent and failed counts rather than claiming no mail was sent', async (t) => {
  const h = harness(t, { enabled: false, deliveryCounts: [{ status: 'sent', total: 2 }, { status: 'failed', total: 1 }] });
  await h.deliverWeek(new Date('2026-10-19T02:00:00Z'));
  assert.deepEqual(h.runs.at(-1), ['2026-10-12', 'attention', '已发送 2 封；失败 1 封；周报已暂停', 0]);
});

test('unexpected failure is recorded safely and releases sender lock', async (t) => {
  const h = harness(t, { activityError: true });
  await assert.rejects(h.deliverWeek(new Date('2026-10-19T01:01:00Z')), /database unavailable/);
  assert.deepEqual(h.runs.at(-1), ['2026-10-12', 'attention', '执行异常，请检查服务日志', 0]);
  assert.ok(h.released);
});

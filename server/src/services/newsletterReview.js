const db = require('../platformDb');
const { allActivity } = require('../repositories/activityRepository');
const { previousWeek, fail } = require('../lib/contentPlatform');

function upcomingWeek(now = new Date()) {
  const current = previousWeek(now);
  const scheduled = new Date(`${current.end.replace(' ', 'T')}Z`).getTime() + 9 * 3600000;
  const scheduledAt = new Date(scheduled <= now.getTime() ? scheduled + 7 * 86400000 : scheduled);
  const { key, start, end } = previousWeek(scheduledAt);
  return { key, start, end, scheduledAt: scheduledAt.toISOString() };
}

async function reviewedItems(period) {
  const items = await allActivity(period);
  const [excluded] = await db.query(
    'SELECT content_type,content_id FROM newsletter_exclusions WHERE week_start=?', [period.key],
  );
  const keys = new Set(excluded.map((item) => `${item.content_type}:${item.content_id}`));
  return items.map((item) => ({ ...item, included: !keys.has(`${item.type}:${item.id}`) }));
}

async function preview(now = new Date()) {
  const period = upcomingWeek(now);
  const [[run]] = await db.query('SELECT started_at FROM newsletter_runs WHERE week_start=?', [period.key]);
  return { period, items: await reviewedItems(period), editable: !run?.started_at };
}

async function recentRuns(now = new Date()) {
  const [runs] = await db.query('SELECT * FROM newsletter_runs ORDER BY week_start DESC LIMIT 12');
  const byWeek = new Map(runs.map((run) => [
    run.week_start instanceof Date ? run.week_start.toISOString().slice(0, 10) : String(run.week_start).slice(0, 10), run,
  ]));
  const latest = previousWeek(now);
  const first = new Date(`${latest.key}T00:00:00Z`).getTime() - (latest.due ? 0 : 7 * 86400000);
  return Array.from({ length: 12 }, (_, index) => {
    const key = new Date(first - index * 7 * 86400000).toISOString().slice(0, 10);
    return byWeek.get(key) || { week_start: key, status: 'missing', reason: '无运行记录', item_count: 0,
      first_checked_at: null, last_checked_at: null, started_at: null };
  });
}

async function selectItem(input, now = new Date()) {
  if (!input || typeof input.included !== 'boolean' ||
      !['post', 'update', 'release'].includes(input.type) ||
      !Number.isSafeInteger(input.id) || input.id <= 0 ||
      typeof input.weekStart !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.weekStart)) {
    throw fail('内容选择格式不正确');
  }
  const connection = await db.getConnection();
  let locked = false;
  try {
    const [[lock]] = await connection.query("SELECT GET_LOCK('mooncci-newsletter',0) acquired");
    locked = Boolean(lock.acquired);
    if (!locked) throw fail('周报正在处理，请稍后刷新', 409);
    const period = upcomingWeek(now);
    if (input.weekStart !== period.key) throw fail('本期已到发送时间，请刷新', 409);
    const [[run]] = await db.query('SELECT started_at FROM newsletter_runs WHERE week_start=?', [period.key]);
    if (run?.started_at) throw fail('本期已开始发送，不能再修改', 409);
    const items = await allActivity(period);
    if (!items.some((item) => item.type === input.type && Number(item.id) === input.id)) {
      throw fail('内容已不在本期周报中', 409);
    }
    await db.query(input.included
      ? 'DELETE FROM newsletter_exclusions WHERE week_start=? AND content_type=? AND content_id=?'
      : 'INSERT IGNORE INTO newsletter_exclusions (week_start,content_type,content_id) VALUES (?,?,?)',
    [period.key, input.type, input.id]);
    return { ok: true };
  } finally {
    try {
      if (locked) await connection.query("SELECT RELEASE_LOCK('mooncci-newsletter')");
    } finally { connection.release(); }
  }
}

module.exports = { upcomingWeek, reviewedItems, preview, selectItem, recentRuns };

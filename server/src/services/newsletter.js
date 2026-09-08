const { siteOrigin } = require('../lib/siteIdentity');
const db = require('../platformDb');
const { sendMail, getMailConfig, isMailEnabled, safeSiteUrl } = require('../lib/mailer');
const { activity, allActivity } = require('../repositories/activityRepository');
const {
  hash,
  token,
  sqlDate,
  previousWeek,
  xml,
  plain,
  definiteMailFailure,
} = require('../lib/contentPlatform');
const { newsletterMessage } = require('../lib/contentMail');
async function rss() {
  const config = await getMailConfig(),
    origin = siteOrigin();
  const { items } = await activity({ pageSize: 50 });
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>mooncci · 最近更新</title><link>${xml(origin)}</link><description>文章、近况与作品进展</description><language>zh-cn</language><atom:link href="${xml(origin)}/api/feed.xml" rel="self" type="application/rss+xml"/>${items.map((i) => `<item><title>${xml(i.title)}</title><link>${xml(origin + i.path)}</link><guid isPermaLink="false">${xml(`urn:mooncci:${i.type}:${i.id}`)}</guid><description>${xml(plain(i.excerpt))}</description><pubDate>${new Date(i.published_at).toUTCString()}</pubDate></item>`).join('')}</channel></rss>`;
}
async function deliverWeek(now = new Date()) {
  if (process.env.NEWSLETTER_DELIVERY_ENABLED !== 'true') return { skipped: true };
  const period = previousWeek(now);
  if (!period.due) return { skipped: true };
  const connection = await db.getConnection();
  let locked = false;
  try {
    const [[lock]] = await connection.query("SELECT GET_LOCK('mooncci-newsletter',0) acquired");
    locked = Boolean(lock.acquired);
    if (!locked) return { skipped: true };
    const [[setting]] = await db.query('SELECT enabled FROM newsletter_settings WHERE id=1');
    if (!setting?.enabled) return { skipped: true };
    const config = await getMailConfig();
    if (!isMailEnabled(config)) return { skipped: true };
    await db.query(
      "UPDATE newsletter_deliveries SET status='uncertain',error='发送进程中断，请核对 SMTP 日志' WHERE status='sending' AND updated_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 15 MINUTE)",
    );
    await db.query('DELETE FROM newsletter_tokens WHERE expires_at<UTC_TIMESTAMP()');
    const items = await allActivity(period);
    if (!items.length) return { empty: true };
    await db.query(
      "INSERT IGNORE INTO newsletter_deliveries (subscriber_id,week_start) SELECT id,? FROM subscribers WHERE status='active' AND confirmed_at<=?",
      [period.key, sqlDate(now)],
    );
    const [jobs] = await db.query(
      "SELECT d.id,d.subscriber_id,s.email FROM newsletter_deliveries d JOIN subscribers s ON s.id=d.subscriber_id WHERE d.week_start=? AND s.status='active' AND d.status IN ('pending','failed') AND d.attempts<4 AND (d.next_attempt_at IS NULL OR d.next_attempt_at<=UTC_TIMESTAMP()) ORDER BY d.id LIMIT 100",
      [period.key],
    );
    const origin = siteOrigin();
    for (const job of jobs) {
      const [[enabled]] = await db.query('SELECT enabled FROM newsletter_settings WHERE id=1');
      if (!enabled?.enabled) break;
      const [claim] = await db.query(
        "UPDATE newsletter_deliveries d JOIN subscribers s ON s.id=d.subscriber_id SET d.status='sending',d.attempts=d.attempts+1,d.updated_at=UTC_TIMESTAMP() WHERE d.id=? AND s.status='active' AND d.status IN ('pending','failed')",
        [job.id],
      );
      if (!claim.affectedRows) continue;
      try {
        const unsubscribe = token();
        await db.query(
          'INSERT INTO newsletter_tokens (token_hash,subscriber_id,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 YEAR))',
          [hash(unsubscribe), job.subscriber_id],
        );
        const url = `${origin}/subscription/unsubscribe#${unsubscribe}`;
        const current = await allActivity(period);
        if (!current.length) {
          await db.query("UPDATE newsletter_deliveries SET status='skipped' WHERE id=?", [
            job.id,
          ]);
          continue;
        }
        const [[recipient]] = await db.query('SELECT status FROM subscribers WHERE id=?', [
          job.subscriber_id,
        ]);
        if (recipient?.status !== 'active') {
          await db.query(
            "UPDATE newsletter_deliveries SET status='skipped',error=NULL WHERE id=?",
            [job.id],
          );
          continue;
        }
        const result = await sendMail({
          to: job.email,
          subject: `mooncci 周报 · ${period.key}`,
          ...newsletterMessage(current, origin, url),
          config,
        });
        if (!result.sent) throw Object.assign(new Error('邮件配置未启用'), { code: 'EAUTH' });
        await db.query(
          "UPDATE newsletter_deliveries SET status='sent',error=NULL,updated_at=UTC_TIMESTAMP() WHERE id=?",
          [job.id],
        );
      } catch (error) {
        const definite = definiteMailFailure(error);
        await db.query(
          'UPDATE newsletter_deliveries SET status=?,error=?,next_attempt_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 MINUTE),updated_at=UTC_TIMESTAMP() WHERE id=?',
          [
            definite ? 'failed' : 'uncertain',
            definite
              ? String(error.code || error.responseCode)
              : '发送结果不明确，请核对 SMTP 日志',
            job.id,
          ],
        );
      }
    }
    return { processed: jobs.length };
  } finally {
    try {
      if (locked) await connection.query("SELECT RELEASE_LOCK('mooncci-newsletter')");
    } finally {
      connection.release();
    }
  }
}
module.exports = { rss, deliverWeek, newsletterMessage };

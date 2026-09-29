const { subscriptionConfirmation } = require('../lib/contentMail');
const {siteOrigin}=require('../lib/siteIdentity');
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../platformDb');
const { authRequired, ownerOnly } = require('../middleware/auth');
const {
  asyncRoute: a,
  fail,
  emailAddress,
  token,
  hash,
  pagination,
  previousWeek,
} = require('../lib/contentPlatform');
const { sendMail, getMailConfig, isMailEnabled, safeSiteUrl } = require('../lib/mailer');
const { rss } = require('../services/newsletter');
const { allActivity } = require('../repositories/activityRepository');
const router = require('../lib/asyncRouter')(),
  admin = require('../lib/asyncRouter')();
const limited = rateLimit({
  windowMs: 3600000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: '请求过于频繁，请稍后重试' },
});
router.get(
  '/feed.xml',
  a(async (_req, res) => {
    res
      .set('Cache-Control', 'no-cache, must-revalidate')
      .type('application/rss+xml')
      .send(await rss());
  }),
);
router.get(
  '/subscriptions/status',
  a(async (_req, res) =>
    res.json({
      available:
        process.env.NEWSLETTER_DELIVERY_ENABLED === 'true' && isMailEnabled(await getMailConfig(), 'news'),
    }),
  ),
);
router.post(
  '/subscriptions',
  limited,
  a(async (req, res) => {
    const email = emailAddress(req.body.email),
      config = await getMailConfig();
    if (process.env.NEWSLETTER_DELIVERY_ENABLED !== 'true' || !isMailEnabled(config, 'news'))
      throw fail('邮件订阅尚未开放，请先使用 RSS', 503);
    const message = '如果该邮箱需要确认，我们已发送确认邮件，请检查收件箱。';
    await db.query('INSERT IGNORE INTO subscribers (email) VALUES (?)', [email]);
    const raw = token();
    const [claim] = await db.query(
      "UPDATE subscribers SET status='pending',confirm_hash=?,confirm_expires=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 24 HOUR),last_confirmation_at=UTC_TIMESTAMP() WHERE email=? AND status<>'active' AND (last_confirmation_at IS NULL OR last_confirmation_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 HOUR))",
      [hash(raw), email],
    );
    if (claim.affectedRows) {
      const url = `${siteOrigin()}/subscription/confirm#${raw}`;
      const unsubscribe = token();
      try {
        await db.query(
          'INSERT INTO newsletter_tokens (token_hash,subscriber_id,expires_at) SELECT ?,id,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 YEAR) FROM subscribers WHERE email=? AND confirm_hash=?',
          [hash(unsubscribe), email, hash(raw)],
        );
        const delivery = await sendMail({ channel: 'news',
          to: email,
          subject: '确认订阅 mooncci 周报',
          ...subscriptionConfirmation(url, `${siteOrigin()}/subscription/unsubscribe#${unsubscribe}`),
          config,
        });
        if (!delivery.sent) throw new Error('Confirmation was not sent');
      } catch {
        throw fail('确认邮件暂时未能发送，请稍后重试', 503);
      }
    }
    res.json({ message });
  }),
);
function validToken(req) {
  const raw = req.body.token;
  if (typeof raw !== 'string' || !/^[a-f0-9]{64}$/.test(raw)) throw fail('链接无效或已过期');
  return hash(raw);
}
router.post(
  '/subscriptions/confirm',
  limited,
  a(async (req, res) => {
    const [r] = await db.query(
      "UPDATE subscribers SET status='active',confirmed_at=UTC_TIMESTAMP() WHERE confirm_hash=? AND confirm_expires>UTC_TIMESTAMP() AND status='pending'",
      [validToken(req)],
    );
    if (!r.affectedRows) {
      const [existing] = await db.query("SELECT id FROM subscribers WHERE confirm_hash=? AND confirm_expires>UTC_TIMESTAMP() AND status='active'", [validToken(req)]);
      if (!existing.length) throw fail('链接无效或已过期，请重新申请订阅。');
    }
    res.json({ message: '您已成功订阅 mooncci 周报。每周一北京时间 09:00，有新内容时会收到文章、近况与作品进展摘要。' });
  }),
);
router.post(
  '/subscriptions/unsubscribe',
  limited,
  a(async (req, res) => {
    const [existing] = await db.query(
      'SELECT s.id FROM subscribers s JOIN newsletter_tokens t ON t.subscriber_id=s.id WHERE t.token_hash=? AND t.expires_at>UTC_TIMESTAMP()',
      [validToken(req)],
    );
    if (!existing.length) throw fail('退订链接无效或已过期，请使用最近一封邮件中的链接，或联系 support@mooncci.site。');
    await db.query(
      "UPDATE subscribers s JOIN newsletter_tokens t ON t.subscriber_id=s.id SET s.status='unsubscribed',s.confirm_hash=NULL WHERE t.token_hash=? AND t.expires_at>UTC_TIMESTAMP()",
      [validToken(req)],
    );
    res.json({ message: '已取消 mooncci 周报订阅。后续周报将不再发送；已经发出的邮件可能仍会到达。你仍可通过网站或 RSS 关注更新。' });
  }),
);
admin.use(authRequired, ownerOnly);
admin.get(
  '/newsletter',
  a(async (req, res) => {
    const [[settings]] = await db.query('SELECT enabled FROM newsletter_settings WHERE id=1');
    const [counts] = await db.query(
      'SELECT status,COUNT(*) total FROM subscribers GROUP BY status',
    );
    const { page, pageSize, offset } = pagination(req.query);
    const [[{ total }]] = await db.query('SELECT COUNT(*) total FROM newsletter_deliveries');
    const [items] = await db.query(
      'SELECT d.*,s.email FROM newsletter_deliveries d JOIN subscribers s ON s.id=d.subscriber_id ORDER BY d.id DESC LIMIT ? OFFSET ?',
      [pageSize, offset],
    );
    res.json({
      enabled: Boolean(settings?.enabled),
      deliveryConfigured: process.env.NEWSLETTER_DELIVERY_ENABLED === 'true',
      counts,
      deliveries: { items, total: Number(total), page, pageSize },
    });
  }),
);
admin.put(
  '/newsletter',
  a(async (req, res) => {
    if (typeof req.body.enabled !== 'boolean') throw fail('开关格式不正确');
    await db.query('UPDATE newsletter_settings SET enabled=? WHERE id=1', [
      req.body.enabled ? 1 : 0,
    ]);
    res.json({ ok: true });
  }),
);
admin.get(
  '/newsletter/preview',
  a(async (_req, res) => {
    const period = previousWeek();
    res.json({ period, items: await allActivity(period) });
  }),
);
admin.get(
  '/subscribers',
  a(async (req, res) => {
    const { page, pageSize, offset } = pagination(req.query);
    const [[{ total }]] = await db.query('SELECT COUNT(*) total FROM subscribers');
    const [items] = await db.query(
      'SELECT id,email,status,confirmed_at,created_at FROM subscribers ORDER BY id DESC LIMIT ? OFFSET ?',
      [pageSize, offset],
    );
    res.json({ items, total: Number(total), page, pageSize });
  }),
);
admin.put(
  '/subscribers/:id',
  a(async (req, res) => {
    if (req.body.status !== 'unsubscribed') throw fail('后台仅可取消订阅，不能代替用户确认');
    await db.query("UPDATE subscribers SET status='unsubscribed',confirm_hash=NULL WHERE id=?", [
      req.params.id,
    ]);
    res.json({ ok: true });
  }),
);
admin.put(
  '/newsletter/deliveries/:id',
  a(async (req, res) => {
    if (!['sent', 'skipped'].includes(req.body.status)) throw fail('仅可标记已发送或跳过');
    const [r] = await db.query(
      "UPDATE newsletter_deliveries SET status=?,error=NULL WHERE id=? AND status='uncertain'",
      [req.body.status, req.params.id],
    );
    if (!r.affectedRows) throw fail('记录不存在或不需要人工处理');
    res.json({ ok: true });
  }),
);
function errors(error, _req, res, next) {
  if (error.status) return res.status(error.status).json({ message: error.message });
  next(error);
}
router.use(errors);
admin.use(errors);
module.exports = { router, admin };

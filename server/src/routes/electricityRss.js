const { roomAccess } = require('../middleware/electricityRoom');
const express = require('express');
const { authRequired, ownerOnly } = require('../middleware/auth');
const repository = require('../repositories/electricityReportRepository');
const { currentScope, siteOrigin } = require('../lib/electricityRssToken');
const { renderElectricityRss } = require('../lib/electricityReport');
const router = require('../lib/asyncRouter')();
router.use((_req, res, next) => {
  res.set({
    'Cache-Control': 'private, no-store, max-age=0',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    Vary: 'Cookie, Authorization',
  });
  next();
});
// The token is never sent to analytics, application logs, or the feed body.
router.get('/feed.xml', async (req, res) => {
  try {
    const subscription =
      typeof req.query.token === 'string'
        ? await repository.resolveSubscription(req.query.token)
        : null;
    if (!subscription)
      return res.status(404).type('text/plain').send('订阅链接无效或已失效');
    const scope = subscription.scope_key;
    const reports = await repository.listReports(scope);
    res
      .type('application/rss+xml')
      .send(renderElectricityRss(reports, siteOrigin(), subscription.room_id));
  } catch {
    res.status(503).type('text/plain').send('电量订阅暂时不可用，请稍后重试');
  }
});
router.use(authRequired, roomAccess());
async function manage(req, res, action) {
  try {
    const scope = currentScope();
    const origin = siteOrigin();
    const result =
      action === 'get'
        ? await repository.getSubscription(req.user.id, scope)
        : await repository.createSubscription(
            req.user.id,
            scope,
            action === 'reset',
          );
    res.json({
      data: {
        url: result.token
          ? `${origin}/api/electricity/rss/feed.xml?token=${result.token}`
          : null,
        resetRequired: result.resetRequired,
      },
    });
  } catch {
    res.status(503).json({ message: '暂时无法管理电量订阅，请稍后重试。' });
  }
}
router.get('/subscription', (req, res) => manage(req, res, 'get'));
router.post('/subscription', (req, res) => manage(req, res, 'create'));
router.post('/subscription/reset', (req, res) => manage(req, res, 'reset'));
module.exports = router;

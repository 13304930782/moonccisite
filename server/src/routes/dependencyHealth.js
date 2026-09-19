const express = require('express');
const rateLimit = require('express-rate-limit');
const { createDependencyHealth } = require('../lib/dependencyHealth');
function createRouter(check = createDependencyHealth()) {
  const router = express.Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('X-Robots-Tag', 'noindex'); next(); });
  router.use(rateLimit({ windowMs: 60000, limit: 30, standardHeaders: true, legacyHeaders: false }));
  router.get('/:service', async (req, res, next) => {
    try {
      const result = await check(req.params.service);
      if (!result) return res.status(404).json({ ok: false });
      res.status(result.ok ? 200 : 503).json(result);
    } catch (error) { next(error); }
  });
  return router;
}
module.exports = { createRouter };

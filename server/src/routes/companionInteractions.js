const express = require('express');
const { createClientLimiter } = require('../middleware/weatherClientLimit');
const repository = require('../repositories/companionInteractionRepository');
function createInteractionRouter(repo = repository) {
  const router = require('../lib/asyncRouter')();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  const limiter = createClientLimiter(120);
  router.use(limiter);
  router.get('/', async (_req, res) => {
    try {
      res.json({ data: await repo.readToday() });
    } catch {
      res.status(503).json({ message: '互动统计暂不可用。' });
    }
  });
  router.post('/', async (req, res) => {
    const { id, kind } = req.body || {};
    if (
      typeof id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      ) ||
      !['pet', 'hit'].includes(kind)
    )
      return res.status(400).json({ message: '无效的小球互动。' });
    try {
      res.json({ data: await repo.record({ id: id.toLowerCase(), kind }) });
    } catch (error) {
      res.status(error.status === 409 ? 409 : 503).json({
        message:
          error.status === 409
            ? error.message
            : '此次互动未确认记录，请稍后查看统计。',
      });
    }
  });
  return router;
}
module.exports = { createInteractionRouter };

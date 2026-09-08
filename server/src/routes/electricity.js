const { authRequired } = require('../middleware/auth');
const {
  roomAccess,
  privateElectricity,
} = require('../middleware/electricityRoom');
const rooms = require('../repositories/electricityRoomRepository');
const express = require('express');
const { getDashboardData } = require('../services/electricityMonitor');

const router = require('../lib/asyncRouter')();
router.use(privateElectricity, authRequired);
router.get('/rooms', async (req, res) => {
  try {
    res.json({ data: await rooms.listRooms(req.user) });
  } catch {
    res.status(503).json({ message: '暂时无法读取宿舍列表。' });
  }
});
router.use(roomAccess());

function historyDays(value, fallback = 30) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(1, Math.min(90, Math.trunc(parsed)))
    : fallback;
}

router.get('/', async (req, res) => {
  try {
    res.json({ data: await getDashboardData(historyDays(req.query.days)) });
  } catch {
    res.status(503).json({ message: '电量数据暂时不可用，请稍后再试。' });
  }
});

router.get('/current', async (_req, res) => {
  try {
    const dashboard = await getDashboardData(7);
    res.json({
      data: {
        current: dashboard.current,
        metrics: dashboard.metrics,
        status: dashboard.status,
        timezone: dashboard.timezone,
      },
    });
  } catch {
    res.status(503).json({ message: '电量数据暂时不可用，请稍后再试。' });
  }
});

router.get('/history', async (req, res) => {
  try {
    const dashboard = await getDashboardData(historyDays(req.query.days));
    res.json({
      data: { history: dashboard.history, timezone: dashboard.timezone },
    });
  } catch {
    res.status(503).json({ message: '电量历史暂时不可用，请稍后再试。' });
  }
});

module.exports = router;

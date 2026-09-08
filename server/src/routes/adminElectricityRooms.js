const express = require('express');
const rateLimit = require('express-rate-limit');
const { authRequired, ownerOnly } = require('../middleware/auth');
const { privateElectricity } = require('../middleware/electricityRoom');
const rooms = require('../repositories/electricityRoomRepository');
const router = require('../lib/asyncRouter')();
router.use(privateElectricity, authRequired, ownerOnly);
const writes = rateLimit({
  windowMs: 60000,
  limit: 6,
  keyGenerator: (req) => String(req.user.id),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: '宿舍验证操作较频繁，请一分钟后重试。' },
});
function failure(res, error) {
  return res
    .status(error.status || (error.code === 'ER_DUP_ENTRY' ? 409 : 502))
    .json({
      message:
        error.code === 'ELECTRICITY_ROOM_INPUT'
          ? error.message
          : error.code === 'ELECTRICITY_KEY_UNAVAILABLE'
            ? '请先在服务器配置电量凭据加密密钥。'
            : '操作未完成，请检查查询凭据或稍后重试。',
    });
}
router.get('/', async (req, res) => {
  try {
    res.json({ data: await rooms.listRooms(req.user) });
  } catch (e) {
    failure(res, e);
  }
});
router.get('/:id/members', async (req, res) => {
  try {
    if (!(await rooms.getRoom(req.params.id))) return res.sendStatus(404);
    res.json({ data: await rooms.members(req.params.id) });
  } catch (e) {
    failure(res, e);
  }
});
router.post('/preview', writes, async (req, res) => {
  try {
    res.json({ data: await rooms.importRooms(req.body.rooms, true) });
  } catch (e) {
    failure(res, e);
  }
});
router.post('/', writes, async (req, res) => {
  try {
    res.status(201).json({ data: await rooms.importRooms(req.body.rooms) });
  } catch (e) {
    failure(res, e);
  }
});
router.put('/:id', writes, async (req, res) => {
  try {
    res.json({ data: await rooms.updateRoom(req.params.id, req.body) });
  } catch (e) {
    failure(res, e);
  }
});
module.exports = router;

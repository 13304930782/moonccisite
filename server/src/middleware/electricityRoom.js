const rooms = require('../repositories/electricityRoomRepository');
function privateElectricity(_req, res, next) {
  res.set({
    'Cache-Control': 'private, no-store',
    Vary: 'Cookie, Authorization',
    'X-Robots-Tag': 'noindex, nofollow',
  });
  next();
}
function roomAccess({ credentials = false } = {}) {
  return async (req, res, next) => {
    try {
      const id = req.query.roomId;
      if (
        id !== undefined &&
        (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id))
      )
        return res.status(400).json({ message: '宿舍选择无效。' });
      const selected = id || (await rooms.listRooms(req.user))[0]?.id;
      if (!selected)
        return res
          .status(404)
          .json({ message: '尚未绑定宿舍，请联系站长添加。' });
      const room = await rooms.accessibleRoom(req.user, selected);
      if (!room)
        return res.status(404).json({ message: '宿舍不存在或无权访问。' });
      req.electricityRoom = room;
      await rooms.inRoom(room, () => next(), { credentials });
    } catch {
      res.status(503).json({ message: '暂时无法读取宿舍设置。' });
    }
  };
}
module.exports = { privateElectricity, roomAccess };

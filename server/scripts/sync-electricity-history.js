require('dotenv').config({
  path: require('path').resolve(__dirname, '../.env'),
});
const db = require('../src/db');
const {
  syncElectricityHistory,
} = require('../src/services/electricityHistorySync');
(async () => {
  try {
    const rooms = require('../src/repositories/electricityRoomRepository');
    const option = process.argv.indexOf('--room-id');
    const id =
      option >= 0
        ? process.argv[option + 1]
        : (await rooms.listRooms({ role: 'owner' })).find((room) => room.legacy)
            ?.id;
    const room = id && (await rooms.getRoom(id));
    if (!room)
      throw Object.assign(new Error('请选择宿舍'), {
        code: 'ELECTRICITY_ROOM_REQUIRED',
      });
    const result = await rooms.inRoom(
      room,
      () =>
        syncElectricityHistory({
          onlyIfMissing: process.argv.includes('--if-missing'),
        }),
      { credentials: true },
    );
    const messages = {
      synced: `学校历史用电已入库：${result.count} 天。请刷新电量页面。`,
      already_imported: '昨日学校日明细已入库，无需重复补同步。',
      empty: '学校未返回有效历史用电，请检查接口结果。',
      busy: '另一个同步任务正在执行，请稍后查看。',
      cooldown: '历史同步间隔至少 15 分钟，请稍后重试。',
    };
    console.log(messages[result.status]);
    if (['empty', 'busy', 'cooldown'].includes(result.status))
      process.exitCode = 2;
  } catch (error) {
    console.error(
      '历史导入失败：',
      error.code || 'ELECTRICITY_HISTORY_SYNC_FAILED',
    );
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();

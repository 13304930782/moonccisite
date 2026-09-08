require('dotenv').config();
const db = require('../src/db');
require('../src/repositories/electricityRoomRepository')
  .migrateLegacy()
  .then((id) =>
    console.log(
      id
        ? '原有宿舍已迁移为仅站长可见，保留原报告与私密订阅。'
        : '未配置原有宿舍，可在后台添加。',
    ),
  )
  .catch((error) => {
    console.error(error.code || 'ELECTRICITY_ROOM_MIGRATION_FAILED');
    process.exitCode = 1;
  })
  .finally(() => db.end());

const fs = require('fs'),
  path = require('path');
const db = require('../src/db');
const tables = [
  'electricity_snapshots',
  'electricity_monitor_state',
  'electricity_reports',
  'electricity_rss_subscriptions',
  'electricity_daily_usage',
  'electricity_midnight_snapshots',
  'electricity_rooms',
  'electricity_room_members',
  'electricity_room_state',
  'electricity_room_runs',
  'site_settings',
  'schema_migrations',
];
(async () => {
  const directory = path.resolve(process.argv[2] || '');
  if (!process.argv[2]) throw new Error('BACKUP_DIRECTORY_REQUIRED');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const conn = await db.getConnection();
  try {
    await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await conn.beginTransaction();
    for (const table of tables) {
      let schema;
      try {
        [schema] = await conn.query(`SHOW CREATE TABLE ${table}`);
      } catch (e) {
        if (e.code === 'ER_NO_SUCH_TABLE') continue;
        throw e;
      }
      const [rows] = await conn.query(
        `SELECT * FROM ${table}` +
          (table === 'site_settings'
            ? " WHERE setting_key='electricity' OR setting_key LIKE 'electricity\\_%'"
            : ''),
      );
      fs.writeFileSync(
        path.join(directory, table + '.json'),
        JSON.stringify({ schema: schema[0]['Create Table'], rows }),
        { mode: 0o600, flag: 'wx' },
      );
    }
    await conn.commit();
    console.log('电量数据与结构备份完成。');
  } finally {
    conn.release();
  }
})()
  .catch((e) => {
    console.error(e.code || 'ELECTRICITY_BACKUP_FAILED');
    process.exitCode = 1;
  })
  .finally(() => db.end());

const db = require('../db');
const { setTimeout: delay } = require('node:timers/promises');
async function schoolRequest(callback) {
  const conn = await db.getConnection();
  let locked = false;
  try {
    const [[lock]] = await conn.query(
      "SELECT GET_LOCK('mooncci:electricity-upstream',15) AS acquired",
    );
    if (!lock.acquired)
      throw Object.assign(new Error('学校查询队列繁忙，请稍后重试'), {
        code: 'ELECTRICITY_QUEUE_BUSY',
      });
    locked = true;
    const [rows] = await conn.query(
      "SELECT setting_value FROM site_settings WHERE setting_key='electricity_upstream_last'",
    );
    const wait = 1000 - (Date.now() - Number(rows[0]?.setting_value || 0));
    if (wait > 0) await delay(Math.min(1000, wait));
    await conn.query(
      "INSERT INTO site_settings(setting_key,setting_value) VALUES('electricity_upstream_last',?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)",
      [String(Date.now())],
    );
    return await callback();
  } finally {
    if (locked)
      await conn
        .query("SELECT RELEASE_LOCK('mooncci:electricity-upstream')")
        .catch(() => {});
    conn.release();
  }
}
module.exports = { schoolRequest };
